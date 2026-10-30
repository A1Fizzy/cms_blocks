/** Personal CMS library. All callable entry points enforce owner access. */
function assertOwner_() {
  const owner = PropertiesService.getScriptProperties().getProperty('OWNER_EMAIL');
  const active = Session.getActiveUser().getEmail().toLowerCase();
  if (!owner || !active || active !== owner.toLowerCase()) {
    throw new Error('Доступ закрыт. Владелец должен выполнить setup и открыть приложение под своим Google-аккаунтом.');
  }
}

/** Run once manually from the Apps Script editor, as the owner. */
function setup() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const props = PropertiesService.getScriptProperties();
    const email = Session.getEffectiveUser().getEmail();
    if (!email || Session.getActiveUser().getEmail().toLowerCase() !== email.toLowerCase()) throw new Error('Запустите setup из редактора под аккаунтом владельца.');
    const owner = props.getProperty('OWNER_EMAIL');
    if (owner && owner.toLowerCase() !== email.toLowerCase()) throw new Error('Настройка доступна только владельцу.');
    if (owner && !Session.getActiveUser().getEmail()) throw new Error('Запустите setup из редактора.');
    props.setProperty('OWNER_EMAIL', email);
    if (!props.getProperty('LIBRARY_FILE_ID')) {
      const folder = DriveApp.createFolder('Полка — CMS блоки');
      const data = {categories: ['Статьи', 'Разводящие', 'Продуктовые'].map((name, i) => ({id: i + 1, name})), blocks: [], nextId: 4};
      const file = folder.createFile('library.json', JSON.stringify(data), MimeType.PLAIN_TEXT);
      props.setProperty('LIBRARY_FILE_ID', file.getId());
    }
    return 'Готово: библиотека создана. Повторный setup сохраняет существующие данные.';
  } finally { lock.releaseLock(); }
}

function doGet() {
  assertOwner_();
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Полка — CMS блоки')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function libraryApi(path, method, input) {
  assertOwner_();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const id = PropertiesService.getScriptProperties().getProperty('LIBRARY_FILE_ID');
    if (!id) throw new Error('Сначала выполните setup в редакторе Apps Script.');
    const file = DriveApp.getFileById(id);
    const data = JSON.parse(file.getBlob().getDataAsString('UTF-8'));
    if (path === 'library' && method === 'GET') return {categories: data.categories, blocks: data.blocks};
    const match = /^(categories|blocks)(?:\/(\d+))?$/.exec(path);
    if (!match) throw new Error('Неизвестный запрос.');
    const table = match[1];
    const ident = match[2] ? Number(match[2]) : null;
    const index = data[table].findIndex(item => item.id === ident);
    if (ident !== null && index === -1) throw new Error('Запись не найдена. Обновите страницу.');
    let resultId = ident;
    if (method === 'DELETE' && ident !== null) {
      data[table].splice(index, 1);
      if (table === 'categories') data.blocks = data.blocks.filter(block => block.category_id !== ident);
    } else if ((method === 'POST' && ident === null) || (method === 'PUT' && ident !== null)) {
      if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 160) throw new Error('Введите название длиной до 160 символов.');
      const record = {id: ident === null ? data.nextId++ : ident, name: input.name.trim()};
      if (table === 'blocks') {
        if (!data.categories.some(c => c.id === input.category_id)) throw new Error('Направление не найдено.');
        if (typeof input.html !== 'string' || typeof input.css !== 'string') throw new Error('HTML и CSS должны быть текстом.');
        if (input.html.length + input.css.length > 500000) throw new Error('Размер кода одного блока — не более 500 000 символов.');
        Object.assign(record, {category_id: input.category_id, html: input.html, css: input.css});
      }
      if (ident === null) data[table].push(record); else data[table][index] = record;
      resultId = record.id;
    } else throw new Error('Метод не поддерживается.');
    const serialized = JSON.stringify(data);
    if (serialized.length > 5000000) throw new Error('Библиотека превысила лимит этой версии: 5 млн символов. Сохранение отменено.');
    file.setContent(serialized);
    return {id: resultId};
  } finally { lock.releaseLock(); }
}
