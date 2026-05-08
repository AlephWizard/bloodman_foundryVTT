export {
  foundryVersion,
  getFoundryGeneration,
  isV10Plus,
  isV11Plus,
  isV12Plus,
  isV13Plus,
  isV14Plus
} from "./version.mjs";

export {
  compatFromUuid,
  fromUuid,
  compatFromUuidSync,
  fromUuidSync,
  compatGetDocumentClass,
  getDocumentClass,
  getRollClass,
  createRoll,
  getDialogClass,
  getDialogV2Class,
  getAudioHelper,
  getLegacyApplicationClass,
  getDocumentCollectionClass,
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
