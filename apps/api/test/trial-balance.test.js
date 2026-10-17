import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBlocks,resolveBlocks,OBAN_TB_ESTATE_ID,clean} from '../src/service/trial-balance-data.js';
const block=code=>({_id:`block-${code}`,estateId:OBAN_TB_ESTATE_ID,blockCode:code,mapBlockNames:[code]});
const blocks=['K2','K3','K4','E5','D-5','D5','H4A','H4B','G8+G7A','G7B'].map(block);
const boundary={features:blocks.filter(b=>b.blockCode!=='H4B').map(b=>({properties:{blockName:b.blockCode},geometry:{type:'Polygon',coordinates:[[[0,0],[1,0],[0,1],[0,0]]]}}))};
test('explicit ranges and shorthand retain every reference',()=>{
 assert.deepEqual(parseBlocks('K2-K4, E12/13').tokens,['K2','K3','K4','E12','E13']);
 assert.deepEqual(parseBlocks('D-5').tokens,['D-5']);
 assert.equal(parseBlocks('K@ and K3').unparsed,'K@');
 assert.equal(parseBlocks('L3,L4,L5ND K3').unparsed,'L5ND K3');
});
test('unique formatting normalization, never split/combined guessing',()=>{
 assert.equal(resolveBlocks('E05',blocks,boundary).references[0].blockCode,'E5');
 assert.equal(resolveBlocks('D-5',blocks,boundary).references[0].blockCode,'D-5');
 assert.equal(resolveBlocks('EO5',blocks,boundary).status,'ambiguous');
 assert.equal(resolveBlocks('H4',blocks,boundary).references[0].status,'ambiguous');
 assert.equal(resolveBlocks('G7',blocks,boundary).references[0].candidates.length,2);
 assert.equal(resolveBlocks('L5',blocks,boundary).references[0].status,'missing');
});
test('map geometry required and no building/fabricated block links',()=>{
 assert.equal(resolveBlocks('H4B',blocks,boundary).references[0].status,'master_without_map');
 assert.equal(resolveBlocks('Block 2',blocks,boundary,{building:true}).status,'non_plantation_reference');
 assert.equal(resolveBlocks(null,blocks,boundary).status,'not_provided');
 assert.equal(resolveBlocks('K2; L5',blocks,boundary).status,'partial');
 assert.equal(clean('-'),null);assert.equal(clean('000000'),'000000');
});

test('never links another estate master',()=>{
 const foreign={...block('L5'),estateId:'another-estate'};
 assert.equal(resolveBlocks('L5',[...blocks,foreign],boundary).references[0].blockId,null);
});
