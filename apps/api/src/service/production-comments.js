import {createHash} from 'node:crypto';
import {z} from 'zod';
import {requireWrite} from './auth.js';
import {QueryError} from './performance.js';
const id=z.string().regex(/^[a-zA-Z0-9-]{1,100}$/);
export const commentInput=z.object({sourceBlockId:id,year:z.number().int().min(1900).max(2200),comment:z.string().trim().min(1).max(4000),
  sourceSystem:z.string().max(100).default('manual'),sourceFile:z.string().max(300).optional(),sourceSheet:z.string().max(100).optional(),
  sourceRow:z.number().int().positive().optional(),sourceCell:z.string().max(30).optional(),sourceHash:z.string().max(64).optional(),}).strict();
export const commentId=(estateId,r)=>'pc-'+createHash('sha256').update(JSON.stringify([estateId,r.sourceBlockId,r.year])).digest('hex').slice(0,40);
export function installProductionComments(api,{ProductionComment},{scope,verifyName,namesAndBlocks}) {
  if(!ProductionComment)return;
  api.get('/production/comments',async(req,res)=>{
    const estateId=await scope(req),{names}=await namesAndBlocks(estateId);
    const code=z.string().max(100).optional().parse(req.query.mapBlockCode);
    const chosen=names.filter(n=>!code||n.mapBlockCode===code),nm=new Map(chosen.map(n=>[n._id,n]));
    const rows=await ProductionComment.find({estateId,sourceBlockId:{$in:[...nm.keys()]}}).select('-history').sort({year:-1,sourceBlockId:1}).limit(10001).lean();
    if(rows.length>10000)throw new QueryError('Select a block to narrow the comment history',413);
    res.json({items:rows.map(r=>({...r,id:r._id,sourceBlockCode:nm.get(r.sourceBlockId)?.sourceBlockCode,division:nm.get(r.sourceBlockId)?.division,mapBlockCode:nm.get(r.sourceBlockId)?.mapBlockCode}))});
  });
  api.post('/production/comments',requireWrite,async(req,res)=>{
    const estateId=await scope(req),record=commentInput.parse(req.body.record);await verifyName(estateId,record);
    const _id=commentId(estateId,record);if(await ProductionComment.exists({_id}))throw new QueryError('A comment exists for this source block and year. Edit it instead.',409);
    await ProductionComment.create({_id,estateId,...record,revision:0,updatedBy:req.access.subject});res.status(201).json({id:_id});
  });
  api.patch('/production/comments/:id',requireWrite,async(req,res)=>{
    const estateId=await scope(req),record=commentInput.parse(req.body.record);await verifyName(estateId,record);
    const where={_id:id.parse(req.params.id),estateId,revision:z.number().int().min(0).parse(req.body.revision)};
    const old=await ProductionComment.findOne(where).select('-history').lean();if(!old)throw new QueryError('Comment changed. Reload before saving.',409);
    if(old.sourceBlockId!==record.sourceBlockId||old.year!==record.year)throw new QueryError('Source block and year cannot change. Add a separate comment.');
    const result=await ProductionComment.updateOne(where,{$set:{...record,updatedBy:req.access.subject},$inc:{revision:1},$push:{history:{at:new Date(),by:req.access.subject,previous:old}}});
    if(!result.modifiedCount)throw new QueryError('Comment changed. Reload before saving.',409);res.json({saved:true});
  });
}
