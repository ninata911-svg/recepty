
(function(){
  const select=document.querySelector('[data-theme-select]');
  const saved=localStorage.getItem('recipe-theme')||'sage';
  document.documentElement.dataset.theme=saved==='sage'?'':saved;
  if(select) select.value=saved;
  if(select) select.addEventListener('change',()=>{
    const value=select.value;
    document.documentElement.dataset.theme=value==='sage'?'':value;
    localStorage.setItem('recipe-theme',value);
  });
})();
