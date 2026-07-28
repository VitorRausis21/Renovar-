const Papa = require('papaparse');
const XLSX = require('xlsx');
const { formatPhone, isValidPhone } = require('../utils/formatPhone');

class CsvService {
  static parseCSV(buffer) {
    const text = buffer.toString('utf-8');
    const result = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
    });
    return CsvService._mapToLeads(result.data);
  }

  static parseExcel(buffer) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

    const normalized = rows.map((row) => {
      const obj = {};
      Object.keys(row).forEach((key) => {
        obj[key.trim().toLowerCase()] = row[key];
      });
      return obj;
    });

    return CsvService._mapToLeads(normalized);
  }

  static _mapToLeads(rows) {
    const leads = [];
    const errors = [];

    rows.forEach((row, index) => {
      const nome = row.nome || row.name || '';
      const whatsappRaw = String(row.whatsapp || row.telefone || row.phone || '').replace(/\D/g, '');
      const observacoes = row.observacoes || row.observacao || row.notes || '';

      if (!nome || !whatsappRaw) {
        errors.push({ row: index + 2, reason: 'Nome ou WhatsApp ausente' });
        return;
      }

      // Normaliza (adiciona 55, remove "9" extra) antes de validar/inserir,
      // para nao gravar numeros que a Evolution rejeitaria com "exists:false".
      const whatsapp = formatPhone(whatsappRaw);

      if (!isValidPhone(whatsapp)) {
        errors.push({ row: index + 2, reason: `WhatsApp invalido: ${whatsappRaw}` });
        return;
      }

      leads.push({
        nome: nome.trim(),
        whatsapp,
        origem: 'Planilha',
        observacoes: observacoes.trim() || null,
        status: 'Novo',
      });
    });

    return { leads, errors };
  }

  static generateCSV(data) {
    return Papa.unparse(data, {
      header: true,
      delimiter: ';',
    });
  }
}

module.exports = CsvService;
