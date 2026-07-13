
const grid=document.querySelector('#recipe-grid');
const search=document.querySelector('#search');
const category=document.querySelector('#category');
const tagCloud=document.querySelector('#tag-cloud');
const empty=document.querySelector('#empty');
let recipes=[];
let activeTag=new URLSearchParams(location.search).get('tag')||'';
const esc=v=>String(v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));

function renderTags(){
  const tags=[...new Set(recipes.flatMap(r=>r.tags))].sort((a,b)=>a.localeCompare(b,'ru'));
  tagCloud.innerHTML=`<button class="tag-button ${activeTag?'':'active'}" data-tag="">Все метки</button>`+
    tags.map(t=>`<button class="tag-button ${activeTag===t?'active':''}" data-tag="${esc(t)}">${esc(t)}</button>`).join('');
  tagCloud.querySelectorAll('button').forEach(b=>b.onclick=()=>{
    activeTag=b.dataset.tag;
    const u=new URL(location.href);
    activeTag?u.searchParams.set('tag',activeTag):u.searchParams.delete('tag');
    history.replaceState(null,'',u);
    renderTags();render();
  });
}
function render(){
  const q=search.value.trim().toLowerCase(),c=category.value;
  const list=recipes.filter(r=>
    (!q||`${r.title} ${r.description} ${r.tags.join(' ')}`.toLowerCase().includes(q))&&
    (!c||r.category===c)&&(!activeTag||r.tags.includes(activeTag))
  );
  grid.innerHTML=list.map(r=>`
    <article class="card">
      <a href="${esc(r.url)}">
        <img src="${esc(r.image)}" alt="${esc(r.title)}">
        <div class="card-body">
          <span class="category-pill">${esc(r.category)}</span>
          <h2>${esc(r.title)}</h2>
          <p class="desc">${esc(r.description)}</p>
          <div class="meta"><span>⏱ ${esc(r.time)}</span><span>🍽 ${esc(r.servings)}</span></div>
        </div>
      </a>
    </article>`).join('');
  empty.hidden=list.length>0;
}
fetch('data/recipes.json').then(r=>r.json()).then(data=>{
  recipes=data;
  [...new Set(recipes.map(r=>r.category))].sort((a,b)=>a.localeCompare(b,'ru')).forEach(c=>category.add(new Option(c,c)));
  renderTags();render();
});
search.addEventListener('input',render);
category.addEventListener('change',render);
