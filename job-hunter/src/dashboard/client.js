(()=>{
  const list=document.querySelector('#job-list'); if(!list)return;
  const cards=[...list.querySelectorAll('.job-card')];
  const search=document.querySelector('#job-search');
  const selects=[...document.querySelectorAll('[data-filter]')];
  const defaultView=document.querySelector('#default-view');
  const sort=document.querySelector('#job-sort');
  const count=document.querySelector('#result-count');
  const empty=document.querySelector('#filtered-empty');
  const inactive=new Set(['closed','archived','rejected_by_user','rejected_by_company','withdrawn']);
  const norm=v=>(v||'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,' ').trim();
  const fuzzy=(query,text)=>{const terms=norm(query).split(' ').filter(Boolean),hay=norm(text);return terms.every(term=>hay.includes(term)||term.split('').every((ch,i)=>hay.indexOf(ch,i?hay.indexOf(term[i-1])+1:0)>=0));};
  function apply(){
    const q=search.value;
    const visible=cards.filter(card=>{
      if(defaultView.checked&&(inactive.has(card.dataset.status)||card.dataset.compensation==='below_floor'))return false;
      if(q&&!fuzzy(q,card.dataset.search))return false;
      return selects.every(sel=>{if(!sel.value)return true;const raw=card.dataset[sel.dataset.filter]||'';return raw.split('|').includes(sel.value);});
    });
    const key=sort.value;
    visible.sort((a,b)=>key==='fit'?+b.dataset.fit-+a.dataset.fit:key==='salary'?+b.dataset.salary-+a.dataset.salary:key==='published'?b.dataset.published.localeCompare(a.dataset.published):key==='discovered'?b.dataset.discovered.localeCompare(a.dataset.discovered):(a.dataset[key]||'').localeCompare(b.dataset[key]||''));
    cards.forEach(card=>card.hidden=true);visible.forEach(card=>{card.hidden=false;list.appendChild(card);});
    count.textContent=`${visible.length} of ${cards.length} roles`;empty.hidden=visible.length!==0;
  }
  search.addEventListener('input',apply);selects.forEach(select=>select.addEventListener('change',apply));defaultView.addEventListener('change',apply);sort.addEventListener('change',apply);
  document.querySelector('#reset-filters').addEventListener('click',()=>{search.value='';selects.forEach(select=>select.value='');defaultView.checked=true;sort.value='fit';apply();search.focus();});
  apply();
})();
