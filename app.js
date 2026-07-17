const $ = (selector) => document.querySelector(selector);
const input = $('#jsonInput');
const inputHighlight = $('#inputHighlight');
const treeView = $('#treeView');
const codeView = $('#codeView');
const errorView = $('#errorView');
const emptyState = $('#emptyState');
let parsedData = null;
let formattedText = '';
let currentView = 'tree';
let autoFormatTimer = null;

const sample = {project:'JSON Lens',version:1,features:['格式化','树形查看','搜索','压缩'],settings:{theme:'system',localOnly:true,indent:2},contributors:[{name:'Developer',active:true}],lastUpdated:null};
const diffSamples={left:{project:'JSON Lens',version:1,settings:{theme:'light',indent:2},features:['format','tree'],deprecated:true},right:{project:'JSON Lens',version:2,settings:{theme:'dark',indent:2,autoSave:true},features:['format','tree','diff'],releasedAt:'2026-07-15'}};
const jsonstrSample={project:'JSON Lens',features:['format','diff','jsonstr'],settings:{localOnly:true,indent:2},enabled:true};

function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
function valueClass(value){if(value===null)return'null';if(typeof value==='string')return'string';if(typeof value==='number')return'number';if(typeof value==='boolean')return'boolean';return'';}
function displayValue(value){if(value===null)return'null';return typeof value==='string'?`"${escapeHtml(value)}"`:escapeHtml(value);}

function bracketPairs(text){
  const pairs=new Map();const stack=[];let quoted=false;let escaped=false;
  for(let i=0;i<text.length;i++){
    const char=text[i];
    if(quoted){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')quoted=false;continue}
    if(char==='"'){quoted=true;continue}
    if(char==='{'||char==='['){stack.push({char,index:i});continue}
    if(char==='}'||char===']'){
      const opening=char==='}'?'{':'[';const top=stack.at(-1);
      if(top?.char===opening){stack.pop();pairs.set(top.index,i);pairs.set(i,top.index)}
    }
  }
  return pairs;
}
let bracketCacheText=null;let bracketCache=new Map();let bracketLineStarts=[0];let renderedBracketText=null;let renderedBracketKey=null;
function ensureBracketCache(text){
  if(bracketCacheText===text)return;
  bracketCacheText=text;bracketCache=bracketPairs(text);bracketLineStarts=[0];
  for(let i=0;i<text.length;i++)if(text[i]==='\n')bracketLineStarts.push(i+1);
  renderedBracketText=null;renderedBracketKey=null;
}
function adjacentBracketIndex(text,position){
  const brackets='{}[]';
  if(position>0&&brackets.includes(text[position-1]))return position-1;
  if(position<text.length&&brackets.includes(text[position]))return position;
  return -1;
}
function renderInputHighlight(position=input.selectionStart){
  const text=input.value;ensureBracketCache(text);const index=adjacentBracketIndex(text,position);const match=bracketCache.get(index);
  const key=index<0||match===undefined?'':`${Math.min(index,match)}:${Math.max(index,match)}`;
  if(renderedBracketText===text&&renderedBracketKey===key)return;
  renderedBracketText=text;renderedBracketKey=key;
  if(!key){inputHighlight.textContent=text;return}
  const marked=new Set([index,match]);let html='';
  for(let i=0;i<text.length;i++)html+=marked.has(i)?`<strong class="matched-bracket">${escapeHtml(text[i])}</strong>`:escapeHtml(text[i]);
  inputHighlight.innerHTML=html;
}
function hoveredInputPosition(event){
  const style=getComputedStyle(input);const rect=input.getBoundingClientRect();
  const canvas=hoveredInputPosition.canvas||(hoveredInputPosition.canvas=document.createElement('canvas'));
  const context=canvas.getContext('2d');context.font=style.font;
  const charWidth=context.measureText('M').width;const lineHeight=parseFloat(style.lineHeight);
  const column=Math.max(0,Math.floor((event.clientX-rect.left-parseFloat(style.paddingLeft)+input.scrollLeft)/charWidth));
  const row=Math.max(0,Math.floor((event.clientY-rect.top-parseFloat(style.paddingTop)+input.scrollTop)/lineHeight));
  ensureBracketCache(input.value);if(row>=bracketLineStarts.length)return input.selectionStart;
  const start=bracketLineStarts[row];const end=row+1<bracketLineStarts.length?bracketLineStarts[row+1]-1:input.value.length;
  return start+Math.min(column,end-start);
}

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

function updateInputStats(){const lines=input.value.split('\n').length;$('#inputStats').textContent=`${input.value.length.toLocaleString()} 字符 · ${lines} 行`;$('#lineNumbers').textContent=Array.from({length:lines},(_,i)=>i+1).join('\n');renderInputHighlight();}
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
function switchView(view){currentView=view;document.querySelectorAll('.view-tab').forEach(b=>b.classList.toggle('active',b.dataset.view===view));if(!formattedText)return;treeView.hidden=view!=='tree';codeView.hidden=view!=='code';$('#expandButton').hidden=view!=='tree';$('#collapseButton').hidden=view!=='tree';}
function readFile(file){if(!file)return;if(file.size>5*1024*1024){toast('文件请勿超过 5 MB');return}const reader=new FileReader();reader.onload=()=>{input.value=reader.result;updateInputStats();formatJson()};reader.readAsText(file);}

const diffLeft=$('#diffLeftInput');
const diffRight=$('#diffRightInput');
const diffResult=$('#diffResult');
const diffLeftHighlight=$('#diffLeftHighlight');
const diffRightHighlight=$('#diffRightHighlight');
let diffTimer=null;

function jsonKind(value){return value===null?'null':Array.isArray(value)?'array':typeof value;}
function childPath(path,key,isArray=false){if(isArray)return`${path}[${key}]`;return /^[A-Za-z_$][\w$]*$/.test(key)?`${path}.${key}`:`${path}[${JSON.stringify(key)}]`;}
function compareValues(before,after,path='$',changes=[]){
  if(Object.is(before,after))return changes;
  const beforeKind=jsonKind(before),afterKind=jsonKind(after);
  if(beforeKind!==afterKind){changes.push({type:'changed',path,before,after});return changes}
  if(beforeKind==='array'){
    const length=Math.max(before.length,after.length);
    for(let i=0;i<length;i++){
      const itemPath=childPath(path,i,true);
      if(i>=before.length)changes.push({type:'added',path:itemPath,after:after[i]});
      else if(i>=after.length)changes.push({type:'removed',path:itemPath,before:before[i]});
      else compareValues(before[i],after[i],itemPath,changes);
    }
    return changes;
  }
  if(beforeKind==='object'){
    const keys=new Set([...Object.keys(before),...Object.keys(after)]);
    keys.forEach(key=>{
      const itemPath=childPath(path,key);
      if(!Object.prototype.hasOwnProperty.call(before,key))changes.push({type:'added',path:itemPath,after:after[key]});
      else if(!Object.prototype.hasOwnProperty.call(after,key))changes.push({type:'removed',path:itemPath,before:before[key]});
      else compareValues(before[key],after[key],itemPath,changes);
    });
    return changes;
  }
  changes.push({type:'changed',path,before,after});
  return changes;
}
function diffValue(value){const text=JSON.stringify(value,null,2);return escapeHtml(text===undefined?String(value):text)}
function jsonToken(value){
  if(value===null)return'<span class="json-null">null</span>';
  const kind=typeof value;
  if(kind==='string')return`<span class="json-string">${escapeHtml(JSON.stringify(value))}</span>`;
  if(kind==='number')return`<span class="json-number">${escapeHtml(value)}</span>`;
  if(kind==='boolean')return`<span class="json-boolean">${value}</span>`;
  return escapeHtml(value);
}
function highlightedJsonLines(value,path='$',depth=0,label=null){
  const indent='  '.repeat(depth);
  const property=label===null?'':`<span class="json-key">${escapeHtml(JSON.stringify(label))}</span>: `;
  const kind=jsonKind(value);
  if(kind!=='object'&&kind!=='array')return[{path,html:`${indent}${property}${jsonToken(value)}`}];
  const isArray=kind==='array';
  const entries=isArray?value.map((item,index)=>[index,item]):Object.entries(value);
  const lines=[{path,html:`${indent}${property}${isArray?'[':'{'}`}];
  entries.forEach(([key,item],index)=>{
    const itemPath=childPath(path,key,isArray);
    const childLines=highlightedJsonLines(item,itemPath,depth+1,isArray?null:key);
    if(index<entries.length-1)childLines[childLines.length-1].html+=',';
    lines.push(...childLines);
  });
  lines.push({path,html:`${indent}${isArray?']':'}'}`});
  return lines;
}
function pathMark(path,marks){
  let result='';let matchLength=-1;
  marks.forEach((type,markPath)=>{if((path===markPath||path.startsWith(`${markPath}.`)||path.startsWith(`${markPath}[`))&&markPath.length>matchLength){result=type;matchLength=markPath.length}});
  return result;
}
function renderHighlightedEditor(element,highlight,value,changes,side){
  element.value=JSON.stringify(value,null,2);
  const marks=new Map();
  changes.forEach(item=>{if(item.type==='changed'||(side==='left'&&item.type==='removed')||(side==='right'&&item.type==='added'))marks.set(item.path,item.type)});
  highlight.innerHTML=highlightedJsonLines(value).map(line=>`<span class="json-code-line${pathMark(line.path,marks)?` diff-${pathMark(line.path,marks)}`:''}">${line.html}</span>`).join('');
  element.scrollTop=0;element.scrollLeft=0;highlight.scrollTop=0;highlight.scrollLeft=0;
}
function renderRawEditor(element,highlight){highlight.textContent=element.value;highlight.scrollTop=element.scrollTop;highlight.scrollLeft=element.scrollLeft}
function parseDiffInput(element,statusElement,label){
  const raw=element.value.trim();
  if(!raw){statusElement.className='';statusElement.textContent=`0 字符 · 等待输入`;return{ok:false,empty:true}}
  try{const value=JSON.parse(raw);statusElement.className='valid';statusElement.textContent=`${element.value.length.toLocaleString()} 字符 · JSON 有效`;return{ok:true,value}}
  catch(error){statusElement.className='invalid';statusElement.textContent=`${element.value.length.toLocaleString()} 字符 · JSON ${label} 无效`;return{ok:false,error}}
}
function updateDiffSummary(changes){
  const summary=$('#diffSummary');summary.hidden=false;
  const counts={added:0,removed:0,changed:0};changes.forEach(item=>counts[item.type]++);
  summary.querySelector('.summary-added').textContent=`+${counts.added} 新增`;
  summary.querySelector('.summary-removed').textContent=`−${counts.removed} 删除`;
  summary.querySelector('.summary-changed').textContent=`${counts.changed} 修改`;
  return counts;
}
function renderDiff(changes){
  const counts=updateDiffSummary(changes);
  if(!changes.length){diffResult.innerHTML='<div class="diff-equal"><div class="diff-equal-icon">✓</div><strong>两个 JSON 完全一致</strong><p>没有发现结构或数值差异。</p></div>';$('#diffStatus').textContent='0 个差异 · 内容完全一致';return}
  const labels={added:'新增',removed:'删除',changed:'修改'};
  diffResult.innerHTML=`<div class="diff-list">${changes.map(item=>`<article class="diff-item ${item.type}"><div class="diff-item-head"><span class="diff-badge">${labels[item.type]}</span><code class="diff-path">${escapeHtml(item.path)}</code></div><div class="diff-values"><div class="diff-value"><small>原始值 / BEFORE</small>${item.type==='added'?'<pre class="diff-missing">此字段不存在</pre>':`<pre>${diffValue(item.before)}</pre>`}</div><div class="diff-value"><small>目标值 / AFTER</small>${item.type==='removed'?'<pre class="diff-missing">此字段不存在</pre>':`<pre>${diffValue(item.after)}</pre>`}</div></div></article>`).join('')}</div>`;
  $('#diffStatus').textContent=`共 ${changes.length} 个差异 · ${counts.added} 新增 / ${counts.removed} 删除 / ${counts.changed} 修改`;
}
function runDiff(notify=false){
  renderRawEditor(diffLeft,diffLeftHighlight);renderRawEditor(diffRight,diffRightHighlight);
  const left=parseDiffInput(diffLeft,$('#diffLeftStats'),'A');
  const right=parseDiffInput(diffRight,$('#diffRightStats'),'B');
  if(left.empty||right.empty){$('#diffSummary').hidden=true;diffResult.innerHTML='<div class="empty-state"><div class="empty-icon">A<span>≠</span>B</div><strong>等待两个 JSON</strong><p>在上方分别粘贴 JSON，<br>这里会自动按字段路径展示差异。</p></div>';$('#diffStatus').textContent='请在左右两侧都输入 JSON';return}
  if(!left.ok||!right.ok){$('#diffSummary').hidden=true;diffResult.innerHTML='<div class="diff-error"><strong>暂时无法对比</strong><br>请先修正标记为无效的 JSON，系统随后会自动重新对比。</div>';$('#diffStatus').textContent='JSON 格式有误';return}
  const changes=compareValues(left.value,right.value);renderHighlightedEditor(diffLeft,diffLeftHighlight,left.value,changes,'left');renderHighlightedEditor(diffRight,diffRightHighlight,right.value,changes,'right');renderDiff(changes);if(notify)toast(`对比完成：发现 ${changes.length} 个差异`);
}
function scheduleDiff(){clearTimeout(diffTimer);diffTimer=setTimeout(()=>runDiff(false),350)}
function switchMode(mode){
  $('#dropZone').hidden=mode!=='formatter';$('#diffPage').hidden=mode!=='diff';$('#jsonstrPage').hidden=mode!=='jsonstr';$('#colorPage').hidden=mode!=='color';
  document.querySelectorAll('.mode-tab').forEach(button=>button.classList.toggle('active',button.dataset.mode===mode));
  const titles={formatter:'JSON Lens · JSON 格式化工具',diff:'JSON Lens · JSON 差异对比',jsonstr:'JSON Lens · JSONStr 双向转换',color:'JSON Lens · RGBA HEX 颜色解析'};document.title=titles[mode];
}

const jsonstrJsonInput=$('#jsonstrJsonInput');
const jsonstrStringInput=$('#jsonstrStringInput');
const jsonstrJsonStats=$('#jsonstrJsonStats');
const jsonstrStringStats=$('#jsonstrStringStats');
let jsonstrTimer=null;let jsonstrSource='json';
function setJsonstrStatus(element,text,state=''){element.className=state;element.textContent=text}
function setJsonstrActions(enabled){$('#copyJsonButton').disabled=!enabled;$('#copyJsonstrButton').disabled=!enabled}
function resetJsonstr(){
  clearTimeout(jsonstrTimer);jsonstrJsonInput.value='';jsonstrStringInput.value='';setJsonstrActions(false);
  setJsonstrStatus(jsonstrJsonStats,'0 字符 · 等待输入');setJsonstrStatus(jsonstrStringStats,'0 字符 · 等待输入');
}
function decodeJsonstr(raw){
  let decoded;
  try{decoded=JSON.parse(raw)}
  catch(primaryError){
    try{decoded=JSON.parse(`"${raw.replace(/\r/g,'\\r').replace(/\n/g,'\\n')}"`)}
    catch{throw primaryError}
  }
  if(typeof decoded!=='string')return decoded;
  return JSON.parse(decoded);
}
function jsonToJsonstr(notify=false){
  const raw=jsonstrJsonInput.value.trim();jsonstrSource='json';
  if(!raw){jsonstrStringInput.value='';setJsonstrActions(false);setJsonstrStatus(jsonstrJsonStats,'0 字符 · 等待输入');setJsonstrStatus(jsonstrStringStats,'0 字符 · 等待输入');return}
  try{
    const value=JSON.parse(raw);const compact=JSON.stringify(value);const result=JSON.stringify(compact);jsonstrStringInput.value=result;
    setJsonstrActions(true);setJsonstrStatus(jsonstrJsonStats,`${jsonstrJsonInput.value.length.toLocaleString()} 字符 · JSON 有效`,'valid');setJsonstrStatus(jsonstrStringStats,`${result.length.toLocaleString()} 字符 · JSONStr 已生成`,'valid');if(notify)toast('已转换为 JSONStr');
  }catch(error){jsonstrStringInput.value='';setJsonstrActions(false);setJsonstrStatus(jsonstrJsonStats,`${jsonstrJsonInput.value.length.toLocaleString()} 字符 · JSON 无效`,'invalid');setJsonstrStatus(jsonstrStringStats,'等待有效 JSON','');}
}
function jsonstrToJson(notify=false){
  const raw=jsonstrStringInput.value.trim();jsonstrSource='jsonstr';
  if(!raw){jsonstrJsonInput.value='';setJsonstrActions(false);setJsonstrStatus(jsonstrJsonStats,'0 字符 · 等待输入');setJsonstrStatus(jsonstrStringStats,'0 字符 · 等待输入');return}
  try{
    const value=decodeJsonstr(raw);const result=JSON.stringify(value,null,2);jsonstrJsonInput.value=result;
    setJsonstrActions(true);setJsonstrStatus(jsonstrStringStats,`${jsonstrStringInput.value.length.toLocaleString()} 字符 · JSONStr 有效`,'valid');setJsonstrStatus(jsonstrJsonStats,`${result.length.toLocaleString()} 字符 · JSON 已还原`,'valid');if(notify)toast('已还原为 JSON');
  }catch(error){jsonstrJsonInput.value='';setJsonstrActions(false);setJsonstrStatus(jsonstrStringStats,`${jsonstrStringInput.value.length.toLocaleString()} 字符 · JSONStr 无效`,'invalid');setJsonstrStatus(jsonstrJsonStats,'等待有效 JSONStr','');}
}
function scheduleJsonstr(source){jsonstrSource=source;clearTimeout(jsonstrTimer);jsonstrTimer=setTimeout(()=>source==='json'?jsonToJsonstr():jsonstrToJson(),250)}

const hexColorInput=$('#hexColorInput');const rgbaColorInput=$('#rgbaColorInput');const colorSwatch=$('#colorSwatch');const colorStatus=$('#colorStatus');
const colorChannels={r:$('#redChannel'),g:$('#greenChannel'),b:$('#blueChannel'),a:$('#alphaChannel')};
let currentColor={r:255,g:79,b:45,a:1};
function parseHexColor(raw){
  let value=raw.trim().replace(/^#/,'');if(!/^[0-9a-f]+$/i.test(value)||![3,4,6,8].includes(value.length))throw new Error('HEX 格式无效');
  if(value.length===3||value.length===4)value=[...value].map(char=>char+char).join('');
  const hasAlpha=value.length===8;return{r:parseInt(value.slice(0,2),16),g:parseInt(value.slice(2,4),16),b:parseInt(value.slice(4,6),16),a:hasAlpha?parseInt(value.slice(6,8),16)/255:1};
}
function parseRgbChannel(value){const percent=value.endsWith('%');const number=parseFloat(value);if(!Number.isFinite(number))throw new Error('颜色通道无效');const result=percent?number*2.55:number;if(result<0||result>255)throw new Error('颜色通道超出范围');return Math.round(result)}
function parseAlphaChannel(value){const percent=value.endsWith('%');const number=parseFloat(value);if(!Number.isFinite(number))throw new Error('透明度无效');const result=percent?number/100:number;if(result<0||result>1)throw new Error('透明度超出范围');return result}
function parseRgbaColor(raw){
  const match=raw.trim().match(/^rgba?\((.*)\)$/i);if(!match)throw new Error('RGBA 格式无效');
  const parts=match[1].trim().replace(/\s*[,/]\s*/g,' ').split(/\s+/).filter(Boolean);if(parts.length<3||parts.length>4)throw new Error('RGBA 通道数量无效');
  return{r:parseRgbChannel(parts[0]),g:parseRgbChannel(parts[1]),b:parseRgbChannel(parts[2]),a:parts[3]===undefined?1:parseAlphaChannel(parts[3])};
}
function hexByte(value){return Math.round(value).toString(16).padStart(2,'0').toUpperCase()}
function colorToHex(color){const base=`#${hexByte(color.r)}${hexByte(color.g)}${hexByte(color.b)}`;return color.a>=.999?base:`${base}${hexByte(color.a*255)}`}
function displayAlpha(value){return Number(value.toFixed(3)).toString()}
function colorToRgba(color){return`rgba(${color.r}, ${color.g}, ${color.b}, ${displayAlpha(color.a)})`}
function renderColor(color,source=''){
  currentColor={r:color.r,g:color.g,b:color.b,a:Math.max(0,Math.min(1,color.a))};const hex=colorToHex(currentColor);const rgba=colorToRgba(currentColor);
  if(source!=='hex')hexColorInput.value=hex;if(source!=='rgba')rgbaColorInput.value=rgba;
  colorSwatch.style.background=rgba;$('#colorPreviewHex').textContent=hex;$('#colorPreviewRgba').textContent=rgba;$('#nativeColorPicker').value=`#${hexByte(currentColor.r)}${hexByte(currentColor.g)}${hexByte(currentColor.b)}`.toLowerCase();
  colorChannels.r.value=currentColor.r;colorChannels.g.value=currentColor.g;colorChannels.b.value=currentColor.b;colorChannels.a.value=Math.round(currentColor.a*100);
  $('#redValue').textContent=currentColor.r;$('#greenValue').textContent=currentColor.g;$('#blueValue').textContent=currentColor.b;$('#alphaValue').textContent=`${Math.round(currentColor.a*100)}%`;
  colorStatus.className='valid';colorStatus.textContent=`颜色有效 · ${currentColor.a>=.999?'不透明':`${Math.round(currentColor.a*100)}% 透明度`}`;
}
function invalidColor(message){colorStatus.className='invalid';colorStatus.textContent=message}
function readColorChannels(){return{r:Number(colorChannels.r.value),g:Number(colorChannels.g.value),b:Number(colorChannels.b.value),a:Number(colorChannels.a.value)/100}}
function randomColor(){renderColor({r:Math.floor(Math.random()*256),g:Math.floor(Math.random()*256),b:Math.floor(Math.random()*256),a:Number((.35+Math.random()*.65).toFixed(2))});toast('已生成随机颜色')}

input.addEventListener('input',()=>{updateInputStats();clearTimeout(autoFormatTimer);if(input.value.trim())autoFormatTimer=setTimeout(()=>formatJson(false),350);else resetResult()});input.addEventListener('scroll',()=>{$('#lineNumbers').scrollTop=input.scrollTop;inputHighlight.scrollTop=input.scrollTop;inputHighlight.scrollLeft=input.scrollLeft});
['click','keyup','select'].forEach(eventName=>input.addEventListener(eventName,()=>renderInputHighlight()));
input.addEventListener('mousemove',event=>renderInputHighlight(hoveredInputPosition(event)));
input.addEventListener('mouseleave',()=>renderInputHighlight());
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
document.querySelectorAll('.mode-tab').forEach(button=>button.addEventListener('click',()=>switchMode(button.dataset.mode)));
jsonstrJsonInput.addEventListener('input',()=>scheduleJsonstr('json'));
jsonstrStringInput.addEventListener('input',()=>scheduleJsonstr('jsonstr'));
$('#jsonstrSampleButton').addEventListener('click',()=>{jsonstrJsonInput.value=JSON.stringify(jsonstrSample,null,2);jsonToJsonstr(true);jsonstrJsonInput.focus()});
$('#clearJsonstrButton').addEventListener('click',()=>{resetJsonstr();jsonstrJsonInput.focus()});
$('#copyJsonButton').addEventListener('click',async()=>{await navigator.clipboard.writeText(jsonstrJsonInput.value);toast('JSON 已复制')});
$('#copyJsonstrButton').addEventListener('click',async()=>{await navigator.clipboard.writeText(jsonstrStringInput.value);toast('JSONStr 已复制')});
hexColorInput.addEventListener('input',()=>{try{renderColor(parseHexColor(hexColorInput.value),'hex')}catch(error){invalidColor(error.message)}});
rgbaColorInput.addEventListener('input',()=>{try{renderColor(parseRgbaColor(rgbaColorInput.value),'rgba')}catch(error){invalidColor(error.message)}});
hexColorInput.addEventListener('blur',()=>renderColor(currentColor));rgbaColorInput.addEventListener('blur',()=>renderColor(currentColor));
Object.values(colorChannels).forEach(channel=>channel.addEventListener('input',()=>renderColor(readColorChannels())));
$('#nativeColorPicker').addEventListener('input',event=>{const picked=parseHexColor(event.target.value);renderColor({...picked,a:currentColor.a})});
$('#copyHexButton').addEventListener('click',async()=>{await navigator.clipboard.writeText(colorToHex(currentColor));toast('HEX 已复制')});
$('#copyRgbaButton').addEventListener('click',async()=>{await navigator.clipboard.writeText(colorToRgba(currentColor));toast('RGBA 已复制')});
$('#colorSampleButton').addEventListener('click',()=>{renderColor({r:255,g:79,b:45,a:.72});toast('已载入示例颜色')});
$('#randomColorButton').addEventListener('click',randomColor);
diffLeft.addEventListener('input',()=>{renderRawEditor(diffLeft,diffLeftHighlight);scheduleDiff()});diffRight.addEventListener('input',()=>{renderRawEditor(diffRight,diffRightHighlight);scheduleDiff()});
diffLeft.addEventListener('scroll',()=>{diffLeftHighlight.scrollTop=diffLeft.scrollTop;diffLeftHighlight.scrollLeft=diffLeft.scrollLeft});diffRight.addEventListener('scroll',()=>{diffRightHighlight.scrollTop=diffRight.scrollTop;diffRightHighlight.scrollLeft=diffRight.scrollLeft});
$('#compareButton').addEventListener('click',()=>runDiff(true));
$('#diffSampleButton').addEventListener('click',()=>{diffLeft.value=JSON.stringify(diffSamples.left,null,2);diffRight.value=JSON.stringify(diffSamples.right,null,2);runDiff(true)});
$('#swapDiffButton').addEventListener('click',()=>{const value=diffLeft.value;diffLeft.value=diffRight.value;diffRight.value=value;runDiff()});
$('#clearDiffButton').addEventListener('click',()=>{diffLeft.value='';diffRight.value='';clearTimeout(diffTimer);runDiff();diffLeft.focus()});
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();const mode=document.querySelector('.mode-tab.active').dataset.mode;if(mode==='formatter')formatJson();else if(mode==='diff')runDiff(true);else if(mode==='jsonstr')jsonstrSource==='json'?jsonToJsonstr(true):jsonstrToJson(true)}});
const zone=$('#dropZone');['dragenter','dragover'].forEach(type=>zone.addEventListener(type,e=>{e.preventDefault();zone.classList.add('dragging')}));['dragleave','drop'].forEach(type=>zone.addEventListener(type,e=>{e.preventDefault();zone.classList.remove('dragging')}));zone.addEventListener('drop',e=>readFile(e.dataTransfer.files[0]));
if(localStorage.getItem('json-lens-theme')==='dark'||(!localStorage.getItem('json-lens-theme')&&matchMedia('(prefers-color-scheme: dark)').matches))document.body.classList.add('dark');
updateInputStats();renderRawEditor(diffLeft,diffLeftHighlight);renderRawEditor(diffRight,diffRightHighlight);renderColor(currentColor);
