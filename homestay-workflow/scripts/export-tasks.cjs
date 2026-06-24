#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const TASKS_FILE = path.join(__dirname, '..', '..', '_shared', 'data', 'tasks.json');
const OUT_DIR = path.join(__dirname, '..', '..', '_shared', 'data', 'exports');
const month = process.argv[2] || new Date().toISOString().slice(0, 7);

(async () => {
  try {
    const ExcelJS = require('../../_shared/node_modules/exceljs');
    const tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8') || '[]');
    if (!Array.isArray(tasks) || !tasks.length) { console.log('暂无任务数据'); process.exit(0); }

    const filtered = tasks.filter(t => t.created_at && t.created_at.startsWith(month));
    if (!filtered.length) { console.log(`${month} 无工单记录`); process.exit(0); }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`维修工单 - ${month}`);
    ws.columns = [
      { header: '工单号', key: 'id', width: 10 },
      { header: '类型', key: 'type', width: 12 },
      { header: '房号', key: 'room', width: 8 },
      { header: '描述', key: 'desc', width: 30 },
      { header: '负责人', key: 'assignee', width: 10 },
      { header: '状态', key: 'status', width: 10 },
      { header: '创建时间', key: 'created_at', width: 18 },
      { header: '完成时间', key: 'completed_at', width: 18 },
      { header: '耗时', key: 'duration', width: 10 },
      { header: '备注', key: 'note', width: 20 }
    ];
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3D2A50' } };

    const statusMap = { done: '已完成', in_progress: '进行中', pending: '待处理', overdue: '已超时' };
    const typeMap = { clean: '保洁', repair: '维修', checkin: '入住准备', general: '通用' };

    filtered.forEach((t, i) => {
      const created = new Date(t.created_at);
      const completed = t.completed_at ? new Date(t.completed_at) : null;
      const duration = completed ? Math.round((completed - created) / 3600000) + 'h' : '-';
      ws.addRow({
        id: t.id || `T${String(i+1).padStart(4,'0')}`,
        type: typeMap[t.type] || t.type || '通用',
        room: t.room || '-',
        desc: t.description || t.title || '-',
        assignee: t.assignee || '-',
        status: statusMap[t.status] || t.status || '-',
        created_at: t.created_at || '-',
        completed_at: t.completed_at || '-',
        duration,
        note: t.note || ''
      });
    });

    const total = filtered.length;
    const done = filtered.filter(t => t.status === 'done').length;
    const overdue = filtered.filter(t => t.status === 'overdue').length;
    ws.addRow({});
    ws.addRow({ id: '', type: '', room: '', desc: `合计: ${total}单 | 已完成: ${done} | 超时: ${overdue}`, assignee: '', status: '', created_at: '', completed_at: '', duration: '', note: '' }).font = { bold: true };

    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
    const outFile = path.join(OUT_DIR, `维修工单台账-${month}.xlsx`);
    await wb.xlsx.writeFile(outFile);
    console.log(`✅ ${outFile} (${total}单, 已完成${done}, 超时${overdue})`);
  } catch (e) {
    if (e.code === 'MODULE_NOT_FOUND') console.log('请先安装: npm install exceljs');
    else console.error('导出失败:', e.message);
    process.exit(1);
  }
})();
