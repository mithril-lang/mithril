export const prefix=`import * as A from "@deepseek-ai/dsh-attachment";import Base from "@deepseek-ai/dsh-attachment";import {Context,Service} from "@deepseek-ai/cordis";import {Branded,brandString} from "@deepseek-ai/dsh-brand";
type Equal<X,Y>=(<T>()=>T extends X?1:2) extends (<T>()=>T extends Y?1:2)?true:false;type Assert<T extends true>=T;
const limits:A.ImageAttachmentLimits={maxImageBytes:4,maxImagesPerMessage:2,maxMessageImageBytes:5,maxImagePixels:4,maxImageDimension:2000,mediaTypes:["image/png"]};
abstract class PartialStore extends Base {validateImage(input:A.SaveImageAttachment):Promise<void>{return Promise.resolve()}saveImage(input:A.SaveImageAttachment):Promise<A.ImageAttachmentRef>{throw new Error()}readImage(ref:A.ImageAttachmentRef):Promise<A.StoredImageAttachment>{throw new Error()}}
`;
export const cases=[
 ['concrete field obligation','class Store extends PartialStore{readonly imageLimits=limits}const store:A.AttachmentStore=new Store(new Context());const service:Service<never>=store;',[]],
 ['default class identity','type Same=Assert<Equal<typeof Base,typeof A.AttachmentStore>>;',[]],
 ['canonical brand owner','const id:A.AttachmentId=brandString<Branded<"AttachmentId">>("id");const plain:string=id;const variant:Branded<"ImageVariantId">=A.ImageVariantId("variant");',[]],
 ['original writable limits','limits.maxImageBytes=8;limits.mediaTypes=["image/jpeg"];',[]],
 ['original writable references','const ref:A.ImageAttachmentRef={attachmentId:A.AttachmentId("id"),mediaType:"image/png",bytes:1,width:1,height:1};ref.width=2;',[]],
 ['streamed file input','const stream:A.SaveFileStreamAttachment={data:(async function*(){yield new Uint8Array([1])})(),signal:new AbortController().signal};',[]],
 ['image admission','declare const store:A.AttachmentStore;const refs:Promise<readonly A.ImageAttachmentRef[]>=A.admitEncodedImages(store,[{mediaType:"image/png",data:"AAAA"}]);',[]],
 ['file admission','declare const store:A.AttachmentStore;const ref:Promise<A.FileAttachmentRef>=A.admitEncodedFile(store,{data:"",name:"empty"});',[]],
 ['prompt discriminants','declare const p:A.AdmittedPromptContentPart;if(p.type==="image"){const id:A.AttachmentId=p.attachment.attachmentId}',[]],
 ['error narrowing','declare const error:unknown;if(A.isAttachmentError(error)){const code:A.AttachmentErrorCode=error.code}if(A.isImageAdmissionError(error)){const code:A.ImageAdmissionErrorCode=error.code}',[]],
 ['context augmentation','const store:A.AttachmentStore=new Context().attachments;',[]],
 ['projection helpers','const d:A.ProjectedDimensions=A.requestImageDimensions(10,20,100);d.width=1;const other:A.ProjectedDimensions=A.longEdgeDimensions(10,20,10);',[]],
 ['type-only alias value','A.AttachmentIdType("id");',[2551]],
 ['missing abstract field','class Missing extends PartialStore{}',[2515]],
 ['wrong abstract field','class Wrong extends PartialStore{readonly imageLimits="bad"}',[2416]],
 ['readonly abstract field','declare const store:A.AttachmentStore;store.imageLimits=limits;',[2540]],
 ['abstract construction','new A.AttachmentStore(new Context());',[2511]],
 ['protected validation','declare const store:A.AttachmentStore;store.validateImageBatch([]);',[2445]],
 ['plain identifier','const id:A.AttachmentId="plain";',[2322]],
 ['different identifier brands','const id:A.AttachmentId=A.ImageVariantId("variant");',[2322]],
 ['plain variant','const id:A.ImageVariantId="plain";',[2322]],
 ['invalid media','const image:A.EncodedImageAttachment={mediaType:"image/unknown",data:"AAAA"};',[2322]],
 ['missing image dimensions','const ref:A.ImageAttachmentRef={attachmentId:A.AttachmentId("id"),mediaType:"image/png",bytes:1};',[2739]],
 ['wrong bytes','const file:A.SaveFileAttachment={data:"AAAA"};',[2322]],
 ['nonstream input','const file:A.SaveFileStreamAttachment={data:new Uint8Array()};',[2741]],
 ['unknown error code','new A.AttachmentError("message","UNKNOWN");',[2345]],
 ['incorrect geometry','A.longEdgeDimensions("width",1,1);',[2345]],
 ['wire versus admitted prompt','const p:A.AdmittedPromptContentPart={type:"image",mediaType:"image/png",data:"AAAA"};',[2353]],
 ['missing limit','const p:A.ImageAttachmentLimits={maxImageBytes:1};',[2739]],
];
