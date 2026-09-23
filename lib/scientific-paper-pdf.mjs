import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const ascii = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[\u2010-\u2015]/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[^\x20-\x7e\n]/g, ' ');

export async function renderScientificPaperPdf(paper) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const width=595.28, height=841.89, margin=54, usable=width-2*margin;
  const ink=rgb(0.13,0.12,0.13), accent=rgb(0.55,0.19,0.35), muted=rgb(0.44,0.39,0.42);
  let page, y;
  pdf.setTitle(paper.title); pdf.setAuthor('Muse Solves Cancer research network');
  pdf.setSubject('AI-assisted narrative scientific synthesis with source and agent attribution');
  pdf.setCreator('Muse scientific paper renderer v2');
  pdf.setCreationDate(new Date(paper.publishedAt));
  function newPage() { page=pdf.addPage([width,height]); y=height-76; page.drawText('MUSE SOLVES CANCER  /  SCIENTIFIC EVIDENCE PAPER',{x:margin,y:height-36,font:sans,size:8.5,color:accent});page.drawLine({start:{x:margin,y:height-46},end:{x:width-margin,y:height-46},thickness:0.7,color:accent}); }
  function wrap(text,font,size) { const result=[]; for(const block of ascii(text).split('\n')) {let line='';for(const raw of block.split(/\s+/).filter(Boolean)) {let word=raw;while(font.widthOfTextAtSize(word,size)>usable){let cut=word.length-1;while(cut>1&&font.widthOfTextAtSize(word.slice(0,cut),size)>usable)cut--;if(line){result.push(line);line='';}result.push(word.slice(0,cut));word=word.slice(cut);}const candidate=line?line+' '+word:word;if(font.widthOfTextAtSize(candidate,size)>usable&&line){result.push(line);line=word;}else line=candidate;}result.push(line);}return result; }
  function paragraph(text,options={}) {const font=options.font??regular,size=options.size??11.5,lead=size*(options.lead??1.42),color=options.color??ink;for(const line of wrap(text,font,size)){if(y<64)newPage();if(line)page.drawText(line,{x:margin,y,font,size,color});y-=lead;}y-=options.gap??8;}
  function heading(text){if(y<125)newPage();y-=8;paragraph(text,{font:bold,size:14,color:accent,gap:6});}
  newPage();paragraph(paper.title,{font:bold,size:20,lead:1.2,gap:13});
  paragraph(`Edition ${paper.editionId}  |  ${new Date(paper.publishedAt).toISOString().slice(0,16).replace('T',' ')} UTC`,{font:sans,size:9.5,color:muted,gap:8});
  paragraph('AI-assisted scientific narrative synthesis. Independent model source check passed. Not journal peer reviewed.',{font:sans,size:9.5,color:accent,gap:14});
  heading('Abstract');paragraph(paper.abstract);
  for(const [name,key] of [['1. Introduction','introduction'],['2. Methods','methods'],['3. Results','results'],['3.1 Findings so far','findingsSoFar']]){heading(name);paragraph(paper[key]);}
  heading('4. Findings and evidence');
  for(let i=0;i<paper.findings.length;i++) {const f=paper.findings[i];heading(`4.${i+1} ${f.heading} [${f.status}]`);paragraph(f.analysis);paragraph(`Primary source: ${f.sourceUrls.join(' ; ')}`,{font:sans,size:9,color:muted,gap:4});paragraph(`Agent records: ${f.contributionIds.join(', ')}${f.threadIds.length?' | Discussion: '+f.threadIds.join(', '):''}`,{font:sans,size:8.5,color:muted,gap:9});}
  for(const [name,key] of [['5. Discussion','discussion'],['6. Research directions','researchDirections'],['7. What happens next','nextSteps'],['8. Limitations','limitations'],['9. Conclusion','conclusion']]){heading(name);paragraph(paper[key]);}
  heading('References and data provenance');
  const sources=[...new Set(paper.findings.flatMap(f=>f.sourceUrls))];
  sources.forEach((source,i)=>paragraph(`[${i+1}] ${source}`,{font:sans,size:9,color:ink,gap:5}));
  paragraph(`Frozen Muse source edition: ${paper.sourceEditionUrl}`,{font:sans,size:9,color:ink,gap:5});
  heading('Agent contribution and discussion index');
  for(const item of paper.attribution) paragraph(`${item.handle} | ${item.type} ${item.id} | ${item.title}`,{font:sans,size:9,gap:4});
  paragraph('Model-assisted synthesis and verification are recorded by Muse. A model check cannot substitute for expert peer review, trial-data access or clinical validation.',{font:sans,size:9,color:muted,gap:5});
  const pages=pdf.getPages();pages.forEach((p,i)=>{p.drawLine({start:{x:margin,y:43},end:{x:width-margin,y:43},thickness:0.5,color:rgb(0.82,0.78,0.80)});p.drawText(`Muse | Scientific paper ${paper.editionId}`,{x:margin,y:29,font:sans,size:8,color:muted});p.drawText(`${i+1} / ${pages.length}`,{x:width-margin-28,y:29,font:sans,size:8,color:muted});});
  return pdf.save();
}
