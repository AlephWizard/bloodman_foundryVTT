export {
  foundryVersion,
  getFoundryGeneration,
  isV10Plus,
  isV11Plus,
  isV12Plus,
  isV13Plus
} from "./version.mjs";

export {
  compatFromUuid,
  fromUuid,
  compatFromUuidSync,
  fromUuidSync,
  compatGetDocumentClass,
  getDocumentClass,
  updateDocument,
  compatEnrichHTML,
  enrichHTML,
  getDragEventData,
  hasSocket,
  socketEmit,
  socketOn,
  socketOff,
  getSystemData,
  getSystemValue
} from "./foundry-api.mjs";
