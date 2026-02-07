/**
 * Copyright (c) 2023 frostime. All rights reserved.
 * https://github.com/frostime/sy-plugin-template-vite
 *
 * See API Document in [API.md](https://github.com/siyuan-note/siyuan/blob/master/API.md)
 * API 文档见 [API_zh_CN.md](https://github.com/siyuan-note/siyuan/blob/master/API_zh_CN.md)
 */

import { fetchSyncPost, IWebSocketData } from "siyuan";

async function request(url: string, data: any) {
  let response: IWebSocketData = await fetchSyncPost(url, data);
  let res = response.code === 0 ? response.data : null;
  return res;
}

// **************************************** Noteboook ****************************************

export async function lsNotebooks(): Promise<IReslsNotebooks> {
  let url = "/api/notebook/lsNotebooks";
  return request(url, "");
}

export async function openNotebook(notebook: NotebookId) {
  let url = "/api/notebook/openNotebook";
  return request(url, { notebook: notebook });
}

export async function closeNotebook(notebook: NotebookId) {
  let url = "/api/notebook/closeNotebook";
  return request(url, { notebook: notebook });
}

export async function renameNotebook(notebook: NotebookId, name: string) {
  let url = "/api/notebook/renameNotebook";
  return request(url, { notebook: notebook, name: name });
}

export async function createNotebook(name: string): Promise<Notebook> {
  let url = "/api/notebook/createNotebook";
  return request(url, { name: name });
}

export async function removeNotebook(notebook: NotebookId) {
  let url = "/api/notebook/removeNotebook";
  return request(url, { notebook: notebook });
}

export async function getNotebookConf(
  notebook: NotebookId
): Promise<IResGetNotebookConf> {
  let data = { notebook: notebook };
  let url = "/api/notebook/getNotebookConf";
  return request(url, data);
}

export async function setNotebookConf(
  notebook: NotebookId,
  conf: NotebookConf
): Promise<NotebookConf> {
  let data = { notebook: notebook, conf: conf };
  let url = "/api/notebook/setNotebookConf";
  return request(url, data);
}

// **************************************** File Tree ****************************************
export async function createDoc(
  notebook: NotebookId,
  path: string,
  title: string,
  md?: string
): Promise<{ id: DocumentId }> {
  let data = {
    notebook: notebook,
    path: path,
    title: title,
    md: md || ""
  };
  let url = "/api/filetree/createDoc";
  return request(url, data);
}

export async function createDocWithMd(
  notebook: NotebookId,
  path: string,
  markdown: string
): Promise<DocumentId> {
  let data = {
    notebook: notebook,
    path: path,
    markdown: markdown,
  };
  let url = "/api/filetree/createDocWithMd";
  return request(url, data);
}

export async function renameDoc(
  notebook: NotebookId,
  path: string,
  title: string
): Promise<DocumentId> {
  let data = {
    doc: notebook,
    path: path,
    title: title,
  };
  let url = "/api/filetree/renameDoc";
  return request(url, data);
}

export async function removeDoc(notebook: NotebookId, path: string) {
  let data = {
    notebook: notebook,
    path: path,
  };
  let url = "/api/filetree/removeDoc";
  return request(url, data);
}

export async function moveDocs(
  fromPaths: string[],
  toNotebook: NotebookId,
  toPath: string
) {
  let data = {
    fromPaths: fromPaths,
    toNotebook: toNotebook,
    toPath: toPath,
  };
  let url = "/api/filetree/moveDocs";
  return request(url, data);
}

export async function getHPathByPath(
  notebook: NotebookId,
  path: string
): Promise<string> {
  let data = {
    notebook: notebook,
    path: path,
  };
  let url = "/api/filetree/getHPathByPath";
  return request(url, data);
}

export async function getHPathByID(id: BlockId): Promise<string> {
  let data = {
    id: id,
  };
  let url = "/api/filetree/getHPathByID";
  return request(url, data);
}

export async function getIDsByHPath(
  notebook: NotebookId,
  path: string
): Promise<BlockId[]> {
  let data = {
    notebook: notebook,
    path: path,
  };
  let url = "/api/filetree/getIDsByHPath";
  return request(url, data);
}

// **************************************** Asset Files ****************************************

export async function upload(
  assetsDirPath: string,
  files: any[]
): Promise<IResUpload> {
  let form = new FormData();
  form.append("assetsDirPath", assetsDirPath);
  for (let file of files) {
    form.append("file[]", file);
  }
  let url = "/api/asset/upload";
  return request(url, form);
}

// **************************************** Block ****************************************
type DataType = "markdown" | "dom";
export async function insertBlock(
  dataType: DataType,
  data: string,
  nextID?: BlockId,
  previousID?: BlockId,
  parentID?: BlockId
): Promise<IResdoOperations[]> {
  let payload = {
    dataType: dataType,
    data: data,
    nextID: nextID,
    previousID: previousID,
    parentID: parentID,
  };
  let url = "/api/block/insertBlock";
  return request(url, payload);
}

export async function prependBlock(
  dataType: DataType,
  data: string,
  parentID: BlockId | DocumentId
): Promise<IResdoOperations[]> {
  let payload = {
    dataType: dataType,
    data: data,
    parentID: parentID,
  };
  let url = "/api/block/prependBlock";
  return request(url, payload);
}

export async function appendBlock(
  dataType: DataType,
  data: string,
  parentID: BlockId | DocumentId
): Promise<IResdoOperations[]> {
  let payload = {
    dataType: dataType,
    data: data,
    parentID: parentID,
  };
  let url = "/api/block/appendBlock";
  return request(url, payload);
}

export async function updateBlock(
  dataType: DataType,
  data: string,
  id: BlockId
): Promise<IResdoOperations[]> {
  let payload = {
    dataType: dataType,
    data: data,
    id: id,
  };
  let url = "/api/block/updateBlock";
  return request(url, payload);
}

export async function deleteBlock(id: BlockId): Promise<IResdoOperations[]> {
  let data = {
    id: id,
  };
  let url = "/api/block/deleteBlock";
  return request(url, data);
}

export async function moveBlock(
  id: BlockId,
  previousID?: PreviousID,
  parentID?: ParentID
): Promise<IResdoOperations[]> {
  let data = {
    id: id,
    previousID: previousID,
    parentID: parentID,
  };
  let url = "/api/block/moveBlock";
  return request(url, data);
}

export async function getBlockKramdown(
  id: BlockId
): Promise<IResGetBlockKramdown> {
  let data = {
    id: id,
  };
  let url = "/api/block/getBlockKramdown";
  return request(url, data);
}

export async function getChildBlocks(
  id: BlockId
): Promise<IResGetChildBlock[]> {
  let data = {
    id: id,
  };
  let url = "/api/block/getChildBlocks";
  return request(url, data);
}

export async function transferBlockRef(
  fromID: BlockId,
  toID: BlockId,
  refIDs: BlockId[]
) {
  let data = {
    fromID: fromID,
    toID: toID,
    refIDs: refIDs,
  };
  let url = "/api/block/transferBlockRef";
  return request(url, data);
}

// **************************************** Attributes ****************************************
export async function setBlockAttrs(
  id: BlockId,
  attrs: { [key: string]: string }
) {
  let data = {
    id: id,
    attrs: attrs,
  };
  let url = "/api/attr/setBlockAttrs";
  return request(url, data);
}

export async function getBlockAttrs(
  id: BlockId
): Promise<{ [key: string]: string }> {
  let data = {
    id: id,
  };
  let url = "/api/attr/getBlockAttrs";
  return request(url, data);
}

// **************************************** SQL ****************************************

export async function sql(sql: string): Promise<any[]> {
  let sqldata = {
    stmt: sql,
  };
  let url = "/api/query/sql";
  return request(url, sqldata);
}

export async function getBlockByID(blockId: string): Promise<Block> {
  let sqlScript = `select * from blocks where id ='${blockId}'`;
  let data = await sql(sqlScript);
  return data[0];
}

export async function searchDocs(keyword: string): Promise<any[]> {
  const url = "/api/search/fullTextSearchBlock";
  return request(url, { query: keyword, types: { document: true } });
}

// **************************************** Template ****************************************

export async function render(
  id: DocumentId,
  path: string
): Promise<IResGetTemplates> {
  let data = {
    id: id,
    path: path,
  };
  let url = "/api/template/render";
  return request(url, data);
}

export async function renderSprig(template: string): Promise<string> {
  let url = "/api/template/renderSprig";
  return request(url, { template: template });
}

// **************************************** File ****************************************

export async function getFile(path: string): Promise<any> {
  let data = { path };
  let url = "/api/file/getFile";
  try {
    return await fetchSyncPost(url, data);
  } catch {
    return null;
  }
}

export async function putFile(path: string, isDir: boolean, file: any) {
  let form = new FormData();
  form.append("path", path);
  form.append("isDir", isDir.toString());
  form.append("modTime", Math.floor(Date.now() / 1000).toString());
  form.append("file", file);
  return request("/api/file/putFile", form);
}

export async function removeFile(path: string) {
  let data = {
    path: path,
  };
  let url = "/api/file/removeFile";
  return request(url, data);
}

export async function readDir(path: string): Promise<IResReadDir> {
  let data = {
    path: path,
  };
  let url = "/api/file/readDir";
  return request(url, data);
}

// **************************************** Export ****************************************

export async function exportMdContent(
  id: DocumentId
): Promise<IResExportMdContent> {
  let data = {
    id: id,
  };
  let url = "/api/export/exportMdContent";
  return request(url, data);
}

export async function exportResources(
  paths: string[],
  name: string
): Promise<IResExportResources> {
  let data = {
    paths: paths,
    name: name,
  };
  let url = "/api/export/exportResources";
  return request(url, data);
}

// **************************************** Convert ****************************************

export type PandocArgs = string;
export async function pandoc(args: PandocArgs[]) {
  let data = {
    args: args,
  };
  let url = "/api/convert/pandoc";
  return request(url, data);
}

// **************************************** Notification ****************************************

// /api/notification/pushMsg
// {
//     "msg": "test",
//     "timeout": 7000
//   }
export async function pushMsg(msg: string, timeout: number = 7000) {
  let payload = {
    msg: msg,
    timeout: timeout,
  };
  let url = "/api/notification/pushMsg";
  return request(url, payload);
}

export async function pushErrMsg(msg: string, timeout: number = 7000) {
  let payload = {
    msg: msg,
    timeout: timeout,
  };
  let url = "/api/notification/pushErrMsg";
  return request(url, payload);
}

// **************************************** Network ****************************************
export async function forwardProxy(
  url: string,
  method: string = "GET",
  payload: any = {},
  headers: any[] = [],
  timeout: number = 7000,
  contentType: string = "text/html"
): Promise<IResForwardProxy> {
  let data = {
    url: url,
    method: method,
    timeout: timeout,
    contentType: contentType,
    headers: headers,
    payload: payload,
  };
  let url1 = "/api/network/forwardProxy";
  return request(url1, data);
}

// **************************************** System ****************************************

export async function bootProgress(): Promise<IResBootProgress> {
  return request("/api/system/bootProgress", {});
}

export async function version(): Promise<string> {
  return request("/api/system/version", {});
}

export async function currentTime(): Promise<number> {
  return request("/api/system/currentTime", {});
}

// **************************************** Flashcard / Riff ****************************************

/**
 * 获取所有闪卡卡组（不包括内置卡组）
 * Get all flashcard decks (excluding built-in deck)
 * 
 * 注意：思源有两种卡组类型：
 * 1. 传统卡组（Traditional Deck）：通过此 API 返回，有独立的卡组 ID
 * 2. 快速制卡（Quick Flashcard）：通过块属性 custom-riff-decks 标记，所有快速制卡都属于内置卡组 (builtinDeckID: "20230218211946-2kw8jgx")
 * 
 * 快速制卡获取方式：
 * - SQL 查询：SELECT DISTINCT a.value FROM attributes a WHERE a.name='custom-riff-decks' AND a.value!=''
 * - 或使用 getTreeRiffCards / getNotebookRiffCards 按文档树/笔记本获取
 */
export async function getRiffDecks(): Promise<IRiffDeck[]> {
  return request("/api/riff/getRiffDecks", {});
}

/**
 * 创建闪卡卡组
 * Create a flashcard deck
 */
export async function createRiffDeck(name: string): Promise<IRiffDeck> {
  return request("/api/riff/createRiffDeck", { name });
}

/**
 * 重命名闪卡卡组
 * Rename a flashcard deck
 */
export async function renameRiffDeck(deckID: string, name: string) {
  return request("/api/riff/renameRiffDeck", { deckID, name });
}

/**
 * 删除闪卡卡组
 * Remove a flashcard deck
 */
export async function removeRiffDeck(deckID: string) {
  return request("/api/riff/removeRiffDeck", { deckID });
}

/**
 * 添加闪卡到卡组
 * Add flashcards to a deck
 */
export async function addRiffCards(deckID: string, blockIDs: string[]) {
  return request("/api/riff/addRiffCards", { deckID, blockIDs });
}

/**
 * 从卡组移除闪卡
 * Remove flashcards from a deck
 */
export async function removeRiffCards(deckID: string, blockIDs: string[]) {
  return request("/api/riff/removeRiffCards", { deckID, blockIDs });
}

/**
 * 获取卡组中的闪卡（分页）
 * Get flashcards in a deck (paginated)
 */
export async function getRiffCards(
  deckID: string,
  page: number = 1,
  pageSize: number = 20
): Promise<IRiffCardsResult> {
  return request("/api/riff/getRiffCards", { id: deckID, page, pageSize });
}

/**
 * 获取文档树中的闪卡（分页）
 * Get flashcards in a document tree (paginated)
 */
export async function getTreeRiffCards(
  rootID: string,
  page: number = 1,
  pageSize: number = 20
): Promise<IRiffCardsResult> {
  return request("/api/riff/getTreeRiffCards", { id: rootID, page, pageSize });
}

/**
 * 获取笔记本中的闪卡（分页）
 * Get flashcards in a notebook (paginated)
 */
export async function getNotebookRiffCards(
  notebookID: string,
  page: number = 1,
  pageSize: number = 20
): Promise<IRiffCardsResult> {
  return request("/api/riff/getNotebookRiffCards", { id: notebookID, page, pageSize });
}

/**
 * 根据块 ID 批量获取闪卡信息
 * Get flashcards by block IDs
 * 
 * 这是获取快速制卡详细信息的推荐方式
 */
export async function getRiffCardsByBlockIDs(blockIDs: string[]): Promise<{ blocks: any[] }> {
  return request("/api/riff/getRiffCardsByBlockIDs", { blockIDs });
}

/**
 * 获取卡组中到期的闪卡
 * Get due flashcards in a deck
 */
export async function getRiffDueCards(
  deckID: string,
  reviewedCards?: Array<{ cardID: string }>
): Promise<IRiffDueCardsResult> {
  return request("/api/riff/getRiffDueCards", { deckID, reviewedCards });
}

/**
 * 获取文档树中到期的闪卡
 * Get due flashcards in a document tree
 */
export async function getTreeRiffDueCards(
  rootID: string,
  reviewedCards?: Array<{ cardID: string }>
): Promise<IRiffDueCardsResult> {
  return request("/api/riff/getTreeRiffDueCards", { rootID, reviewedCards });
}

/**
 * 获取笔记本中到期的闪卡
 * Get due flashcards in a notebook
 */
export async function getNotebookRiffDueCards(
  notebookID: string,
  reviewedCards?: Array<{ cardID: string }>
): Promise<IRiffDueCardsResult> {
  return request("/api/riff/getNotebookRiffDueCards", { notebook: notebookID, reviewedCards });
}

/**
 * 复习闪卡
 * Review a flashcard
 * 
 * @param rating 评分 1-4: 1=Again, 2=Hard, 3=Good, 4=Easy
 */
export async function reviewRiffCard(
  deckID: string,
  cardID: string,
  rating: 1 | 2 | 3 | 4,
  reviewedCards?: Array<{ cardID: string }>
) {
  return request("/api/riff/reviewRiffCard", { deckID, cardID, rating, reviewedCards });
}

/**
 * 跳过复习闪卡
 * Skip reviewing a flashcard
 */
export async function skipReviewRiffCard(deckID: string, cardID: string) {
  return request("/api/riff/skipReviewRiffCard", { deckID, cardID });
}

/**
 * 重置闪卡学习进度
 * Reset flashcard learning progress
 * 
 * @param type 类型: "notebook" | "tree" | "deck"
 * @param id 对应的 ID（笔记本 ID / 文档树根 ID / 卡组 ID）
 * @param deckID 卡组 ID
 * @param blockIDs 要重置的块 ID 列表，为空则重置所有
 */
export async function resetRiffCards(
  type: "notebook" | "tree" | "deck",
  id: string,
  deckID: string,
  blockIDs?: string[]
) {
  return request("/api/riff/resetRiffCards", { type, id, deckID, blockIDs: blockIDs || [] });
}

/**
 * 批量设置闪卡到期时间
 * Batch set flashcard due time
 * 
 * @param cardDues 卡片到期时间列表 [{ id: cardID, due: "20240101120000" }]
 */
export async function batchSetRiffCardsDueTime(
  cardDues: Array<{ id: string; due: string }>
) {
  return request("/api/riff/batchSetRiffCardsDueTime", { cardDues });
}

// **************************************** Flashcard Types ****************************************

export interface IRiffDeck {
  id: string;
  name: string;
  size: number;
  created: string;
  updated: string;
}

export interface IRiffCardsResult {
  blocks: any[];
  total: number;
  pageCount: number;
}

export interface IRiffDueCardsResult {
  cards: any[];
  unreviewedCount: number;
  unreviewedNewCardCount: number;
  unreviewedOldCardCount: number;
}
