const $ = (selector) => document.querySelector(selector);
const input = $('#jsonInput');
const treeView = $('#treeView');
const codeView = $('#codeView');
const errorView = $('#errorView');
const emptyState = $('#emptyState');
let parsedData = null;
let formattedText = '';
let currentView = 'tree';
let autoFormatTimer = null;

const sample = {project:'JSON Lens',version:1,features:['格式化','树形查看','搜索','压缩'],settings:{theme:'system',localOnly:true,indent:2},contributors:[{name:'Developer',active:true}],lastUpdated:null};

function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
function valueClass(value){if(value===null)return'null';if(typeof value==='string')return'string';if(typeof value==='number')return'number';if(typeof value==='boolean')return'boolean';return'';}
function displayValue(value){if(value===null)return'null';return typeof value==='string'?`"${escapeHtml(value)}"`:escapeHtml(value);}

function makeNode(key,value,isRoot=false){
  const wrapper=document.createElement('div'); wrapper.className=isRoot?'tree-root':'tree-node';
  const row=document.createElement('div'); row.className='tree-row';
  const complex=value!==null&&typeof value==='object';
  const toggle=document.createElement('button'); toggle.className=`toggle${complex?'':' placeholder'}`; toggle.textContent='▾'; toggle.type='button'; row.appendChild(toggle);
  if(!isRoot){const keyEl=document.createElement('span');keyEl.className='key';keyEl.textContent=`"${key}"`;row.appendChild(keyEl);row.insertAdjacentHTML('beforeend','<span class="meta">: </span>');}
  if(complex){const isArray=Array.isArray(value);const meta=document.createElement('span');meta.className='meta';meta.textContent=`${isArray?'Array':'Object'} (${isArray?value.length:Object.keys(value).length})`;row.appendChild(meta);const children=document.createElement('div');children.className='children';Object.entries(value).forEach(([k,v])=>{const child=makeNode(k,v);if(isArray){const keyEl=child.querySelector('.key');if(keyEl)keyEl.textContent=k;}children.appendChild(child)});toggle.addEventListener('click',()=>{children.classList.toggle('collapsed');toggle.textContent=children.classList.contains('collapsed')?'▸':'▾'});wrapper.append(row,children);
  }else{const val=document.createElement('span');val.className=valueClass(value);val.textContent=value===null?'null':typeof value==='string'?`"${value}"`:String(value);row.appendChild(val);wrapper.appendChild(row)}
  return wrapper;
}

function updateInputStats(){const lines=input.value.split('\n').length;$('#inputStats').textContent=`${input.value.length.toLocaleString()} 字符 · ${lines} 行`;$('#lineNumbers').textContent=Array.from({length:lines},(_,i)=>i+1).join('\n');}
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(el.timer);el.timer=setTimeout(()=>el.classList.remove('show'),1800);}
function setActions(enabled){['#copyButton','#downloadButton','#minifyButton'].forEach(id=>$(id).disabled=!enabled)}

function resetResult(focusInput=false){
  parsedData=null;formattedText='';treeView.hidden=true;codeView.hidden=true;errorView.hidden=true;emptyState.hidden=false;setActions(false);$('#outputStats').textContent='尚未解析';
  if(focusInput)input.focus();
}

function formatJson(notify=true){
  if(!input.value.trim()){if(notify){toast('请先输入 JSON');input.focus()}return}
  try{
    parsedData=JSON.parse(input.value);formattedText=JSON.stringify(parsedData,null,2);
    treeView.replaceChildren(makeNode('root',parsedData,true));codeView.querySelector('code').textContent=formattedText;
    emptyState.hidden=true;errorView.hidden=true;setActions(true);switchView(currentView);
    const type=Array.isArray(parsedData)?'数组':parsedData!==null&&typeof parsedData==='object'?'对象':typeof parsedData;
    const count=parsedData!==null&&typeof parsedData==='object'?Object.keys(parsedData).length:1;
    $('#outputStats').textContent=`有效 JSON · ${type} · ${count} 个顶层项`;if(notify)toast('格式化完成');
  }catch(error){
    parsedData=null;formattedText='';setActions(false);emptyState.hidden=true;treeView.hidden=true;codeView.hidden=true;errorView.hidden=false;
    const match=error.message.match(/position (\d+)/);let detail='';if(match){const pos=Number(match[1]);const before=input.value.slice(0,pos);detail=`第 ${before.split('\n').length} 行，第 ${pos-before.lastIndexOf('\n')} 列`}
    errorView.innerHTML=`<strong>无法解析这段 JSON</strong>${escapeHtml(error.message)}${detail?`<br>${detail}`:''}<br><br>请检查引号、逗号和括号是否完整。`;$('#outputStats').textContent='JSON 无效';
  }
}
function switchView(view){currentView=view;document.querySelectorAll('.view-tab').forEach(b=>b.classList.toggle('active',b.dataset.view===view));if(!parsedData)return;treeView.hidden=view!=='tree';codeView.hidden=view!=='code';$('#expandButton').hidden=view!=='tree';$('#collapseButton').hidden=view!=='tree';}
function readFile(file){if(!file)return;if(file.size>5*1024*1024){toast('文件请勿超过 5 MB');return}const reader=new FileReader();reader.onload=()=>{input.value=reader.result;updateInputStats();formatJson()};reader.readAsText(file);}

input.addEventListener('input',()=>{updateInputStats();clearTimeout(autoFormatTimer);if(input.value.trim())autoFormatTimer=setTimeout(()=>formatJson(false),350);else resetResult()});input.addEventListener('scroll',()=>{$('#lineNumbers').scrollTop=input.scrollTop});
$('#formatButton').addEventListener('click',formatJson);$('#sampleButton').addEventListener('click',()=>{input.value=JSON.stringify(sample);updateInputStats();formatJson()});
$('#clearButton').addEventListener('click',()=>{input.value='';clearTimeout(autoFormatTimer);resetResult(true);updateInputStats()});
$('#fileInput').addEventListener('change',e=>readFile(e.target.files[0]));
document.querySelectorAll('.view-tab').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));
$('#expandButton').addEventListener('click',()=>{document.querySelectorAll('.children').forEach(n=>n.classList.remove('collapsed'));document.querySelectorAll('.toggle:not(.placeholder)').forEach(n=>n.textContent='▾')});
$('#collapseButton').addEventListener('click',()=>{document.querySelectorAll('.children').forEach(n=>n.classList.add('collapsed'));document.querySelectorAll('.toggle:not(.placeholder)').forEach(n=>n.textContent='▸')});
$('#searchInput').addEventListener('input',e=>{const q=e.target.value.trim().toLowerCase();document.querySelectorAll('.tree-row').forEach(row=>row.classList.toggle('match',!!q&&row.textContent.toLowerCase().includes(q)))});
$('#copyButton').addEventListener('click',async()=>{await navigator.clipboard.writeText(formattedText);toast('已复制到剪贴板')});
$('#minifyButton').addEventListener('click',()=>{formattedText=JSON.stringify(parsedData);codeView.querySelector('code').textContent=formattedText;toast('已压缩 JSON')});
$('#downloadButton').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([formattedText],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='formatted.json';a.click();URL.revokeObjectURL(url);toast('下载已开始')});
$('#themeButton').addEventListener('click',()=>{document.body.classList.toggle('dark');localStorage.setItem('json-lens-theme',document.body.classList.contains('dark')?'dark':'light')});
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();formatJson()}});
const zone=$('#dropZone');['dragenter','dragover'].forEach(type=>zone.addEventListener(type,e=>{e.preventDefault();zone.classList.add('dragging')}));['dragleave','drop'].forEach(type=>zone.addEventListener(type,e=>{e.preventDefault();zone.classList.remove('dragging')}));zone.addEventListener('drop',e=>readFile(e.dataTransfer.files[0]));
if(localStorage.getItem('json-lens-theme')==='dark'||(!localStorage.getItem('json-lens-theme')&&matchMedia('(prefers-color-scheme: dark)').matches))document.body.classList.add('dark');
updateInputStats();
