Size / 1024).toFixed(2)} KB`)
  console.log(`实际数据大小: ${(totalDataSize / 1024).toFixed(2)} KB`)
  console.log(`开销 (索引+元数据): ${((fileSize - totalDataSize) / 1024).toFixed(2)} KB`)
  console.log(`开销比例: ${((fileSize - totalDataSize) / fileSize * 100).toFixed(1)}%`)
  
  // 检查是否需要 VACUUM
  if (fileSize > totalDataSize * 2) {
    console.log('\n⚠️ 建议: 数据库可能有大量碎片，建议执行 VACUUM 优化')
  }
}

// 暴露到全局，方便调试
;(window as any).analyzeDB = analyzeDatabase
ult[0].values.map((row: any) => {
          const obj: any = {}
          sampleResult[0].columns.forEach((col: string, i: number) => {
            const val = String(row[i] || '')
            obj[col] = val.length > 50 ? val.substring(0, 50) + `... (${val.length} chars)` : val
          })
          return obj
        }))
      }
    }
  }
  
  // 获取数据库文件大小
  const exported = dbInstance.export()
  const fileSize = exported.length
  
  console.log('\n========== 总结 ==========')
  console.log(`数据库文件大小: ${(file}
    }
    
    totalDataSize += tableSize
    
    console.log(`\n表: ${tableName}`)
    console.log(`  行数: ${rowCount}`)
    console.log(`  数据大小: ${(tableSize / 1024).toFixed(2)} KB`)
    console.log(`  最大单元格: ${maxCellInfo}`)
    
    // 如果表很大，显示前几行
    if (tableSize > 10000) {
      console.log(`  ⚠️ 此表较大，显示前3行:`)
      const sampleResult = dbInstance.exec(`SELECT * FROM ${tableName} LIMIT 3`)
      if (sampleResult[0]) {
        console.table(sampleRes
    let tableSize = 0
    let maxCellSize = 0
    let maxCellInfo = ''
    
    if (dataResult[0]) {
      for (const dataRow of dataResult[0].values) {
        for (let i = 0; i < dataRow.length; i++) {
          const cellStr = String(dataRow[i] || '')
          const cellSize = cellStr.length
          tableSize += cellSize
          
          if (cellSize > maxCellSize) {
            maxCellSize = cellSize
            maxCellInfo = `列 ${dataResult[0].columns[i]}: ${cellSize} 字符`
          }
        }
      SELECT COUNT(*) FROM ${tableName}`)
    const rowCount = countResult[0]?.values[0]?.[0] || 0
    
    // 获取所有数据
    const dataResult = dbInstance.exec(`SELECT * FROM ${tableName}`)
    getDatabase } from '@/core/database'

export async function analyzeDatabase() {
  const db = await getDatabase()
  const dbInstance = (db as any).db
  
  console.log('========== 数据库分析 ==========')
  
  // 获取所有表
  const tables = dbInstance.exec("SELECT name FROM sqlite_master WHERE type='table'")
  
  if (!tables[0]) {
    console.log('没有找到表')
    return
  }
  
  let totalDataSize = 0
  
  for (const row of tables[0].values) {
    const tableName = row[0]
    
    // 获取行数
    const countResult = dbInstance.exec(`/**
 * 数据库分析工具 - 用于调试数据库大小问题
 */
import { 