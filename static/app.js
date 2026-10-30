const $ = id => document.getElementById(id);
let library = {categories: [], blocks: []}, active = null, editing = null, dirty = false;
let toastTimer;
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 3500); }
async function api(path, method = 'GET', data) {
  const response = await fetch('/api/' + path, {method, headers: {'Content-Type': 'application/json'}, body: data === undefined ? undefined : JSON.stringify(data)});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Не удалось выполнить запрос');
  return result;
}
function preview(html, css) {
  return '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src https: data:; font-src https: data:; base-uri \'none\'; form-action \'none\'"><style>body{margin:0;padding:20px;font-family:Arial,sans-serif;overflow-wrap:anywhere}*{box-sizing:border-box}</style></head><body>' + html + '<style>' + css + '</style></body></html>';
}
async function refresh() {
  library = await api('library');
  if (!library.categories.some(c => c.id === active)) active = library.categories[0]?.id ?? null;
  render();
}
function render() {
  $('tabs').replaceChildren();
  for (const category of library.categories) {
    const button = document.createElement('button'); button.textContent = category.name; button.className = category.id === active ? 'active' : ''; button.setAttribute('aria-pressed', String(category.id === active));
    button.onclick = () => {active = category.id; $('search').value = ''; render();}; $('tabs').append(button);
  }
  const category = library.categories.find(c => c.id === active);
  $('categoryTitle').textContent = category?.name || 'Создайте направление';
  $('deleteCategory').hidden = !category;
  $('addBlock').disabled = !category; $('emptyAdd').hidden = !category;
  const blocks = library.blocks.filter(b => b.category_id === active && b.name.toLocaleLowerCase().includes($('search').value.toLocaleLowerCase()));
  $('count').textContent = blocks.length;
  $('cards').replaceChildren(); $('empty').hidden = !!blocks.length;
  $('empty').querySelector('h3').textContent = $('search').value ? 'Ничего не найдено' : 'Здесь начинается ваша коллекция';
  for (const block of blocks) {
    const card = document.createElement('button'); card.className = 'card'; card.setAttribute('aria-label', 'Открыть блок: ' + block.name);
    const frame = document.createElement('iframe'); frame.setAttribute('sandbox', ''); frame.tabIndex = -1; frame.title = block.name; frame.loading = 'lazy'; frame.srcdoc = preview(block.html, block.css);
    const info = document.createElement('div'); info.className = 'cardInfo';
    const text = document.createElement('div'); const name = document.createElement('strong'); name.textContent = block.name; const detail = document.createElement('small'); detail.textContent = 'HTML + CSS'; text.append(name, detail);
    const arrow = document.createElement('span'); arrow.textContent = '↗'; info.append(text, arrow); card.append(frame, info); card.onclick = () => openBlock(block); $('cards').append(card);
  }
}
function updatePreview() { $('livePreview').srcdoc = preview($('html').value, $('css').value); }
function openBlock(block) {
  editing = block?.id ?? null;
  $('editorTitle').textContent = block ? 'Ваш блок' : 'Новый блок';
  $('blockName').value = block?.name || ''; $('html').value = block?.html || ''; $('css').value = block?.css || '';
  $('blockCategory').replaceChildren(...library.categories.map(c => new Option(c.name, c.id)));
  $('blockCategory').value = block?.category_id ?? active;
  $('deleteBlock').hidden = !block; dirty = false; updatePreview(); $('editor').showModal();
}
function closeEditor() { if (!dirty || confirm('Закрыть без сохранения изменений?')) $('editor').close(); }
$('addBlock').onclick = $('emptyAdd').onclick = () => openBlock();
$('closeEditor').onclick = $('cancelEdit').onclick = closeEditor;
$('editor').addEventListener('cancel', e => {e.preventDefault(); closeEditor();});
$('editForm').addEventListener('input', () => {dirty = true; updatePreview();});
$('search').oninput = render;
$('editForm').onsubmit = async e => {
  e.preventDefault(); const submit = e.submitter; submit.disabled = true;
  try {
    await api('blocks' + (editing === null ? '' : '/' + editing), editing === null ? 'POST' : 'PUT', {name: $('blockName').value, category_id: Number($('blockCategory').value), html: $('html').value, css: $('css').value});
    active = Number($('blockCategory').value); dirty = false; $('editor').close(); await refresh(); toast('Блок сохранён');
  } catch (error) {toast(error.message);} finally {submit.disabled = false;}
};
$('deleteBlock').onclick = async () => {
  if (!confirm('Удалить этот блок без возможности восстановления?')) return;
  try {await api('blocks/' + editing, 'DELETE'); $('editor').close(); await refresh(); toast('Блок удалён');} catch (error) {toast(error.message);}
};
$('addCategory').onclick = () => {$('categoryName').value = ''; $('categoryDialog').showModal();};
$('cancelCategory').onclick = () => $('categoryDialog').close();
$('categoryForm').onsubmit = async e => {
  e.preventDefault(); e.submitter.disabled = true;
  try {const result = await api('categories', 'POST', {name: $('categoryName').value}); active = result.id; $('categoryDialog').close(); await refresh();} catch (error) {toast(error.message);} finally {e.submitter.disabled = false;}
};
$('deleteCategory').onclick = async () => {
  const count = library.blocks.filter(b => b.category_id === active).length;
  if (!confirm(`Удалить направление и все его блоки (${count})? Восстановить их будет невозможно.`)) return;
  try {await api('categories/' + active, 'DELETE'); await refresh();} catch (error) {toast(error.message);}
};
for (const button of document.querySelectorAll('[data-copy]')) button.onclick = async () => {
  const field = $(button.dataset.copy);
  try {
    if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(field.value);
    else {field.focus(); field.select(); if (!document.execCommand('copy')) throw new Error();}
    toast(button.dataset.copy.toUpperCase() + ' скопирован');
  } catch {field.focus(); field.select(); toast('Нажмите Ctrl+C или ⌘C, чтобы скопировать выделенный код');}
};
window.addEventListener('beforeunload', e => {if (dirty && $('editor').open) {e.preventDefault(); e.returnValue = '';}});
refresh().catch(error => toast('Не удалось загрузить библиотеку: ' + error.message));
