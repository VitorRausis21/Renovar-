// Normaliza numeros de WhatsApp para o formato que a Evolution API espera:
// 55 + DDD(2) + numero. Cobre os casos sujos que apareciam no cadastro:
//   - numero sem 55        -> adiciona 55
//   - numero ja com 55     -> mantem
//   - "9 extra" apos o DDD  -> remove (ex: 55419995591338 -> 5541995591338)
//
// Celular BR valido com 55 tem no maximo 13 digitos (55 + DDD + 9 + 8).
// Se chegar com 14 no padrao 55 DD 9 XXXXXXXXX, o primeiro 9 pos-DDD e duplicado.
function formatPhone(phone) {
  if (!phone) return null;
  let digits = String(phone).replace(/\D/g, '');

  // Sem 55 na frente: prefixa (celular 11 dig / fixo 10 dig)
  if (!digits.startsWith('55')) {
    if (digits.length === 10 || digits.length === 11) {
      digits = '55' + digits;
    }
    // fora desses tamanhos, deixa como veio (sera pego por isValidPhone)
  }

  // Remove o "9" duplicado apos o DDD quando ficou com 14 digitos
  // (55 DD 9 seguido de mais 9 digitos -> mantem 55 DD + 9 digitos)
  if (digits.length === 14) {
    digits = digits.replace(/^(55\d{2})9(\d{9})$/, '$1$2');
  }

  return digits;
}

// Valido: 55 + DDD + (10 fixo | 11 celular) => 12 ou 13 digitos.
// Mantemos o minimo em 12 para exigir o 55 ja normalizado.
function isValidPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return /^55\d{2}\d{8,9}$/.test(digits) && (digits.length === 12 || digits.length === 13);
}

module.exports = { formatPhone, isValidPhone };
