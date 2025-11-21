import { getFrontend } from 'siyuan';

export interface LicenseInfo {
    type: 'trial' | 'annual' | 'dragon';
    userId: string;
    userName: string;
    activatedAt: number;
    expiresAt: number;
    code?: string;
    isValid: boolean;
    features: string[];
    lastCheck: number;
}

export class LicenseManager {
    private static readonly LICENSE_FILE = 'license';
    // 会员状态刷新周期（7天）
    private static readonly REFRESH_INTERVAL = 7 * 24 * 60 * 60 * 1000;
    private static readonly S3_CONFIG = {
        accessKey: 'kFCOCF3QVYUcXHk75A5SC9VLPkYzVZZHPq2oApnk',
        secretKey: 'w5YsfJLlrJ3FJdafTq35ht5JYcc38svuDS3YI2Xp',
        bucket: 'siyuan-mediaplayer',
        region: 'cn-south-1',
        encryptionKey: 'SiYuan_Fixed_Master_Key_2024_Secure_Change_This'
    };

    private static isMobileEnv(): boolean {
        try { return getFrontend().endsWith('mobile'); }
        catch { return /Mobile|Android|iP(hone|ad|od)/i.test(navigator.userAgent); }
    }

    // 🎯 唯一入口
    static async activate(code = '', plugin: any) {
        try {
            const existing = await this.load(plugin);

            // 移动端只读：不写入、不申请试用、不激活；仅返回已存在的本地许可
            if (this.isMobileEnv()) {
                if (existing) return { success: true, license: existing, message: this.getStatusMessage(existing) };
                return { success: false, error: '移动端为只读模式，请在桌面端激活或申请体验' };
            }

            if (code.trim()) {
                if (existing) await this.clear(plugin);
                const license = await this.activateWithCode(code.trim(), existing);
                await this.save(license, plugin);
                return { success: true, license, message: '激活成功' };
            }

            if (existing) {
                return { success: true, license: existing, message: this.getStatusMessage(existing) };
            }

            // 体验资格校验：需要登录思源账号，并且远端未使用过试用
            const user = await this.getSiYuanUserInfo();
            if (!user) return { success: false, error: '请先登录思源账号后再申请体验' };

            const trialPath = this.getTrialPath(user.userId);
            const used = await this.existsS3(trialPath).catch(() => false);
            if (used) {
                // 试用标记存在：若未到期，则恢复本地试用许可（不再次写入远端）
                try {
                    const trialData = await this.downloadS3(trialPath).catch(() => null);
                    if (trialData && typeof trialData.expiresAt === 'number' && Date.now() < trialData.expiresAt) {
                        const recovered: LicenseInfo = {
                            type: 'trial',
                            userId: user.userId,
                            userName: user.userName,
                            activatedAt: typeof trialData.activatedAt === 'number' ? trialData.activatedAt : Date.now(),
                            expiresAt: trialData.expiresAt,
                            isValid: true,
                            features: ['basic_playback'],
                            lastCheck: Date.now()
                        };
                        await this.save(recovered, plugin);
                        return { success: true, license: recovered, message: `体验会员已恢复（到期：${new Date(recovered.expiresAt).toLocaleDateString()}）` };
                    }
                } catch {}
                return { success: false, error: '体验已到期，如需继续使用建议开通会员体验' };
            }

            // 标记试用后再下发本地体验许可
            await this.putTrialFlag(user);
            const license = await this.createTrial();
            await this.save(license, plugin);
            return { success: true, license, message: '体验会员激活成功' };
        } catch (error) {
            return error.message === 'ACTIVATION_CODE_NOT_FOUND'
                ? { success: false, error: '激活码异常，如已付费，请备注订单号联系开发者： <a href="https://qm.qq.com/q/z9yQaV760g" target="_blank" style="color: #4285f4; text-decoration: underline;">点击加入QQ群</a>', isHtml: true }
                : { success: false, error: error.message };
        }
    }

    // 📖 加载许可证（移动端只读且不解密）
    static async load(plugin: any): Promise<LicenseInfo | null> {
        try {
            const encrypted = await plugin.loadData(this.LICENSE_FILE);
            if (!encrypted) return null;

            // 移动端或不支持 SubtleCrypto：不解密，不写入，直接返回空（只读）
            if (!(globalThis.crypto && globalThis.crypto.subtle)) return null;

            const license: LicenseInfo = JSON.parse(await this.decrypt(encrypted));
            if (!this.verifySignature(license) || !this.isValid(license)) {
                if (!this.isMobileEnv()) await this.clear(plugin);
                return null;
            }
            // 对年付/永久会员跳过lastCheck限制，但按7天周期做一次轻量刷新
            const refreshed = await this.refreshIfNeeded(license, plugin).catch(() => license);
            return refreshed;
        } catch (error) {
            if (!this.isMobileEnv()) await this.clear(plugin);
            return null;
        }
    }

    // 💾 保存许可证
    private static async save(license: LicenseInfo, plugin: any): Promise<void> {
        const licenseWithSignature = { ...license, signature: this.generateSignature(license) };
        const encrypted = await this.encrypt(JSON.stringify(licenseWithSignature));
        await plugin.saveData(this.LICENSE_FILE, encrypted, 2);
    }

    // 🗑️ 清除许可证
    static async clear(plugin: any): Promise<void> {
        await plugin.saveData(this.LICENSE_FILE, null, 2);
    }

    // ✅ 验证有效性（仅看到期）
    private static isValid(license: LicenseInfo): boolean {
        return !(license.expiresAt > 0 && license.expiresAt < Date.now());
    }

    // 🆕 创建体验会员
    private static async createTrial(): Promise<LicenseInfo> {
        const user = await this.getSiYuanUserInfo();
        return {
            type: 'trial',
            userId: user?.userId || 'guest',
            userName: user?.userName || '游客',
            activatedAt: Date.now(),
            expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000),
            isValid: true,
            features: ['basic_playback'],
            lastCheck: Date.now()
        };
    }

    // 🔥 激活码激活
    private static async activateWithCode(code: string, existing: LicenseInfo | null): Promise<LicenseInfo> {
        const user = await this.getSiYuanUserInfo();
        if (!user) throw new Error('请先登录思源账号');

        const cleanUserName = user.userName.replace(/[^\w\u4e00-\u9fa5]/g, '');
        const userPath = `${code}_${user.userId}_${cleanUserName}.dat`;

        // 智能回退策略
        const strategy = (!existing || existing.type === 'trial') ? 'original-first' : 'user-first';
        
        if (strategy === 'original-first') {
            try {
                return await this.activateFromOriginal(code, user, cleanUserName);
            } catch (error) {
                if (error.message !== 'ORIGINAL_FILE_NOT_FOUND') throw error;
                try { return this.buildLicense(await this.downloadS3(userPath), user, code); }
                catch { throw new Error('ACTIVATION_CODE_NOT_FOUND'); }
            }
        } else {
            try {
                return this.buildLicense(await this.downloadS3(userPath), user, code);
            } catch (error) {
                if (error.message !== 'ACTIVATION_CODE_NOT_FOUND') throw error;
                try { return await this.activateFromOriginal(code, user, cleanUserName); }
                catch (originalError) { throw originalError.message === 'ORIGINAL_FILE_NOT_FOUND' ? new Error('ACTIVATION_CODE_NOT_FOUND') : originalError; }
            }
        }
    }

    // 🔥 从原始激活码激活
    private static async activateFromOriginal(code: string, user: any, cleanUserName: string): Promise<LicenseInfo> {
        let originalData: any;
        try { originalData = await this.downloadS3(`${code}.dat`); }
        catch { throw new Error('ORIGINAL_FILE_NOT_FOUND'); }
        const activatedAt = Date.now();
        const expiresAt = originalData.licenseType === 'dragon' ? 0 : activatedAt + (365 * 24 * 60 * 60 * 1000);

        const userPath = `${code}_${user.userId}_${cleanUserName}.dat`;
        await this.renameS3(`${code}.dat`, userPath, {
            key: originalData.key,
            code: code,
            userId: user.userId,           // ✅ 真实用户ID
            userName: user.userName,       // ✅ 真实用户名
            licenseType: originalData.licenseType,
            maxDevices: originalData.maxDevices || 5,
            notes: `激活于${new Date().toLocaleString()}`,
            status: 'active',              // 🔥 激活后改为 active
            activatedAt: expiresAt         // 🔥 修复：设置到期时间（后端期望的格式）
        });

        return this.buildLicense({ licenseType: originalData.licenseType, activatedAt, expiresAt }, user, code);
    }

    // 🏗️ 构建许可证
    private static buildLicense(data: any, user: any, code: string): LicenseInfo {
        const expiresAt = data.licenseType === 'dragon' ? 0 : (data.expiresAt || data.activatedAt + (365 * 24 * 60 * 60 * 1000));
        return {
            type: data.licenseType,
            userId: user.userId,
            userName: user.userName,
            activatedAt: data.activatedAt,
            expiresAt: expiresAt,
            code: code,
            isValid: true,
            features: this.getFeatures(data.licenseType),
            lastCheck: Date.now()
        };
    }

    // 🔐 本地加密解密
    private static encryptionKey: ArrayBuffer | null = null;
    
    private static async getEncryptionKey(): Promise<ArrayBuffer> {
        if (!this.encryptionKey) {
            this.encryptionKey = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('siyuan-media-player'));
        }
        return this.encryptionKey;
    }

    private static async encrypt(data: string): Promise<string> {
        const key = await this.getEncryptionKey();
        const iv = crypto.getRandomValues(new Uint8Array(16));
        const keyObj = await crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['encrypt']);
        const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, keyObj, new TextEncoder().encode(data));
        
        const combined = new Uint8Array(iv.length + encrypted.byteLength);
        combined.set(iv);
        combined.set(new Uint8Array(encrypted), iv.length);
        return btoa(String.fromCharCode(...combined));
    }

    private static async decrypt(encryptedData: string): Promise<string> {
        const combined = new Uint8Array([...atob(encryptedData.replace(/[^A-Za-z0-9+/=]/g, ''))].map(char => char.charCodeAt(0)));
        const iv = combined.slice(0, 16);
        const encrypted = combined.slice(16);
        
        const key = await this.getEncryptionKey();
        const keyObj = await crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['decrypt']);
        const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, keyObj, encrypted);
        return new TextDecoder().decode(decrypted);
    }

    // 🔍 工具函数
    private static getStatusMessage(license: LicenseInfo): string {
        const typeNames = { trial: '体验会员', annual: '年度会员', dragon: '恶龙会员' };
        const typeName = typeNames[license.type] || license.type;
        return license.type !== 'trial' ? `${typeName}已激活` : `${typeName}已激活（到期：${new Date(license.expiresAt).toLocaleDateString()}）`;
    }

    private static generateSignature(license: LicenseInfo): string {
        const { isValid, ...data } = license;
        return btoa(JSON.stringify(data) + 'salt').slice(0, 32);
    }

    private static verifySignature(license: any): boolean {
        if (!license.signature) return false;
        const { signature, ...data } = license;
        return this.generateSignature(data) === signature;
    }

    private static getFeatures(type: string): string[] {
        const features = {
            trial: ['basic_playback'],
            annual: ['cloud_sync', 'batch_import', 'standard_support'],
            dragon: ['cloud_sync', 'batch_import', 'priority_support', 'advanced_features']
        };
        return features[type] || features.trial;
    }

    // ===== 试用资格标记（极简、一次性） =====
    private static getTrialPath(userId: string): string { return `trial/${userId}.flag`; }

    private static async headS3(path: string): Promise<number> {
        const data = await this.callS3Api('HEAD', path);
        return data?.status ?? 0;
    }

    private static async existsS3(path: string): Promise<boolean> {
        try { return (await this.headS3(path)) === 200; }
        catch { return false; }
    }

    private static async putTrialFlag(user: { userId: string; userName: string }): Promise<void> {
        const now = Date.now();
        const payload = await this.encryptS3Data({
            userId: user.userId,
            userName: user.userName,
            activatedAt: now,
            expiresAt: now + (7 * 24 * 60 * 60 * 1000)
        });
        await this.callS3Api('PUT', this.getTrialPath(user.userId), payload);
    }

    // 🔄 7天一次 S3 轻量刷新（年付/永久）。失败不影响本地状态
    private static async refreshIfNeeded(license: LicenseInfo, plugin: any): Promise<LicenseInfo> {
        if (license.type === 'trial' || !license.code) return license;
        const now = Date.now();
        if (now - (license.lastCheck || 0) < this.REFRESH_INTERVAL) return license;
        // 无论验证成功与否，都更新 lastCheck 避免持续检查
        const updated: LicenseInfo = { ...license, lastCheck: now };
        const userName = (license.userName || '').replace(/[^\w\u4e00-\u9fa5]/g, '');
        const path = `${license.code}_${license.userId}_${userName}.dat`;
        try {
            const exists = await this.existsS3(path);
            // S3文件存在则正常，不存在也不影响本地使用
            await this.save(updated, plugin);
            return updated;
        } catch {
            // save 失败不影响，但至少内存中的 lastCheck 已更新
            return updated;
        }
    }

    // 🌐 S3操作 - 统一API
    private static buildS3Url(path: string): string {
        return `https://${this.S3_CONFIG.bucket}.s3.${this.S3_CONFIG.region}.qiniucs.com/${path}`;
    }

    private static async callS3Api(method: string, path: string, payload?: string): Promise<any> {
        const headers = await this.generateS3Headers(method, path);
        if (method === 'PUT') headers.push(['Content-Type', 'application/json']);
        
        const response = await fetch('/api/network/forwardProxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: this.buildS3Url(path),
                method,
                timeout: method === 'PUT' ? 15000 : 10000,
                headers: headers.map(([key, value]) => ({ [key]: value })),
                ...(payload && { payload })
            })
        });

        let result: any;
        try { result = await response.json(); }
        catch { if (method === 'GET') throw new Error('ACTIVATION_CODE_NOT_FOUND'); throw new Error(`S3${method}失败: 响应格式错误`); }

        // 对 HEAD 的处理：仅返回状态码
        if (method === 'HEAD') {
            if (result.code !== 0) throw new Error(`S3HEAD失败: ${result.msg}`);
            return { status: result.data?.status };
        }

        // 极简激活码错误检测（GET）
        if (method === 'GET' && (result.code !== 0 && [400, 404].includes(result.data?.status) || result.data?.status === 404 && result.data?.body?.includes('NoSuchKey')))
            throw new Error('ACTIVATION_CODE_NOT_FOUND');

        if (result.code !== 0) throw new Error(`S3${method}失败: ${result.msg}`);
        return result.data;
    }

    private static async downloadS3(path: string): Promise<any> {
        return await this.decryptS3Data((await this.callS3Api('GET', path)).body);
    }

    private static async renameS3(oldPath: string, newPath: string, data: any): Promise<void> {
        await this.callS3Api('PUT', newPath, await this.encryptS3Data(data));
        try { await this.callS3Api('DELETE', oldPath); } catch (error) { console.warn(`S3删除失败: ${error.message}`); }
    }

    // 🔐 AWS4签名
    private static async generateS3Headers(method: string, path: string): Promise<[string, string][]> {
        const now = new Date();
        const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, '');
        const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');

        const canonicalUri = `/${path}`;
        const canonicalHeaders = `host:${this.S3_CONFIG.bucket}.s3.${this.S3_CONFIG.region}.qiniucs.com\nx-amz-content-sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\nx-amz-date:${amzDate}\n`;
        const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
        const canonicalRequest = `${method}\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`;

        const algorithm = 'AWS4-HMAC-SHA256';
        const credentialScope = `${dateStamp}/${this.S3_CONFIG.region}/s3/aws4_request`;
        const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${await this.sha256(canonicalRequest)}`;

        const signingKey = await this.getSignatureKey(this.S3_CONFIG.secretKey, dateStamp);
        const signature = await this.hmacSha256(signingKey, stringToSign);

        return [
            ['Authorization', `${algorithm} Credential=${this.S3_CONFIG.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`],
            ['x-amz-content-sha256', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
            ['x-amz-date', amzDate]
        ];
    }

    private static async sha256(message: string): Promise<string> {
        const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
        return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    private static async hmacSha256(key: Uint8Array, message: string): Promise<string> {
        const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
        return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    private static async getSignatureKey(key: string, dateStamp: string): Promise<Uint8Array> {
        const kDate = await this.hmacSha256Raw(new TextEncoder().encode('AWS4' + key), dateStamp);
        const kRegion = await this.hmacSha256Raw(kDate, this.S3_CONFIG.region);
        const kService = await this.hmacSha256Raw(kRegion, 's3');
        return await this.hmacSha256Raw(kService, 'aws4_request');
    }

    private static async hmacSha256Raw(key: Uint8Array, message: string): Promise<Uint8Array> {
        const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
        return new Uint8Array(signature);
    }

    // 🗜️ 统一gzip处理
    private static async processGzipStream(data: Uint8Array, compress: boolean): Promise<Uint8Array> {
        const stream = compress ? new CompressionStream('gzip') : new DecompressionStream('gzip');
        const writer = stream.writable.getWriter();
        const reader = stream.readable.getReader();

        writer.write(data);
        writer.close();

        const chunks = [];
        let done = false;
        while (!done) {
            const { value, done: readerDone } = await reader.read();
            done = readerDone;
            if (value) chunks.push(value);
        }

        const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
            result.set(chunk, offset);
            offset += chunk.length;
        }
        return result;
    }

    // 🔐 S3数据加密解密
    private static async encryptS3Data(data: any): Promise<string> {
        const jsonData = JSON.stringify(data);
        const compressed = await this.processGzipStream(new TextEncoder().encode(jsonData), true);

        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(16));

        const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(this.S3_CONFIG.encryptionKey), 'PBKDF2', false, ['deriveKey']);
        const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 10000, hash: 'SHA-256' }, keyMaterial, { name: 'AES-CBC', length: 256 }, false, ['encrypt']);
        const encrypted = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, compressed);

        return JSON.stringify({
            data: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
            salt: btoa(String.fromCharCode(...salt)),
            iv: btoa(String.fromCharCode(...iv))
        });
    }

    private static async decryptS3Data(encryptedDataStr: string): Promise<any> {
        const encryptedData = JSON.parse(encryptedDataStr);
        const salt = Uint8Array.from(atob(encryptedData.salt), c => c.charCodeAt(0));
        const iv = Uint8Array.from(atob(encryptedData.iv), c => c.charCodeAt(0));

        const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(this.S3_CONFIG.encryptionKey), 'PBKDF2', false, ['deriveKey']);
        const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 10000, hash: 'SHA-256' }, keyMaterial, { name: 'AES-CBC', length: 256 }, false, ['decrypt']);
        const encryptedBytes = Uint8Array.from(atob(encryptedData.data), c => c.charCodeAt(0));
        const decrypted = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, key, encryptedBytes);

        const decryptedArray = new Uint8Array(decrypted);
        const isGzipped = decryptedArray.length >= 2 && decryptedArray[0] === 0x1f && decryptedArray[1] === 0x8b;

        if (isGzipped) {
            const decompressed = await this.processGzipStream(decryptedArray, false);
            return JSON.parse(new TextDecoder().decode(decompressed));
        } else {
            return JSON.parse(new TextDecoder().decode(decryptedArray));
        }
    }

    // 🔍 获取思源用户信息
    static async getSiYuanUserInfo(): Promise<{ userId: string; userName: string } | null> {
        try {
            if ((window as any).siyuan?.user?.userId) {
                return {
                    userId: (window as any).siyuan.user.userId,
                    userName: (window as any).siyuan.user.userName || 'Unknown'
                };
            }

            const response = await fetch('/api/system/getConf');
            if (response.status === 200) {
                const text = await response.text();
                if (text.trim()) {
                    const data = JSON.parse(text);
                    if (data.code === 0 && data.data?.user) {
                        return {
                            userId: data.data.user.userId,
                            userName: data.data.user.userName
                        };
                    }
                }
            }
            return null;
        } catch (error) {
            return null;
        }
    }
}