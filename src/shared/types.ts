export type ClipMode = 'article' | 'selection' | 'bookmark' | 'highlights';
export type SaveMode = 'create' | 'daily' | 'append' | 'database';
export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink';
export type InsertPosition = 'bottom' | 'top';

// --- Native Messaging Wire Protocol (matches ArcMD internal/clipper v1) ---

export interface NativeRequest {
  id: string;
  action: string;
  params?: Record<string, unknown>;
}

export interface NativeResponse<T = unknown> {
  id?: string;
  ok: boolean;
  live?: boolean;
  result?: T;
  error?: string;
}

export interface ClipPingResult {
  version: string;
  protocol: number;
  live: boolean;
  aiReady: boolean;
  aiModel: string;
  activeSpaceId: string;
  activeSpaceName: string;
  hostName: string;
}

export interface ClipDatabaseOption {
  id: string;
  name: string;
  color?: string;
}

export interface ClipDatabaseProperty {
  id: string;
  key: string;
  name: string;
  type: string;
  readOnly?: boolean;
  options?: ClipDatabaseOption[];
}

export interface ClipDatabaseContext {
  path: string;
  title: string;
  icon?: string;
  properties: ClipDatabaseProperty[];
}

export interface ClipSpaceContext {
  id: string;
  name: string;
  icon?: string;
  symbol?: string;
  color?: string;
  attachmentsDir?: string;
  active: boolean;
  folders: string[];
  templates: string[];
  docs: string[];
  databases: ClipDatabaseContext[];
}

export interface ClipContextResult {
  version: string;
  protocol: number;
  live: boolean;
  activeSpaceId: string;
  aiReady: boolean;
  aiModel: string;
  spaces: ClipSpaceContext[];
}

export interface ClipURLMatch {
  spaceId: string;
  spaceName: string;
  path: string;
  title: string;
  kind: 'doc' | 'database';
  recordId?: string;
  recordTitle?: string;
}

export interface ClipCheckURLResult {
  normalizedUrl: string;
  matches: ClipURLMatch[];
}

export interface ClipUploadAssetResult {
  space: string;
  relUrl: string;
  storedPath: string;
  bytes: number;
}

export interface ClipSaveParams {
  space: string;
  mode: SaveMode;
  dir?: string;
  path?: string;
  title?: string;
  content: string;
  frontmatter?: Record<string, unknown>;
  icon?: string;
  cover?: string;
  template?: string;
  dailyPosition?: InsertPosition;
  appendPosition?: InsertPosition;
  fields?: Record<string, unknown>;
  pin?: boolean;
  favorite?: boolean;
  open?: boolean;
}

export interface ClipSaveResult {
  space: string;
  spaceId: string;
  path: string;
  title: string;
  mode: SaveMode;
  existed?: boolean;
  recordId?: string;
}

export interface ClipAIResult {
  summary: string;
  tags: string[];
  custom?: string;
  model?: string;
}

// --- Extraction & Highlighter ---

export interface WebHighlight {
  id: string;
  exact: string;
  prefix: string;
  suffix: string;
  color: HighlightColor;
  note?: string;
  createdAt: string;
}

export interface ExtractedImage {
  url: string;
  alt: string;
  isCover?: boolean;
}

export interface ExtractedPage {
  url: string;
  normalizedUrl: string;
  domain: string;
  title: string;
  author: string;
  published: string;
  siteName: string;
  description: string;
  cover: string;
  articleHtml: string;
  selectionHtml: string;
  selectionText: string;
  images: ExtractedImage[];
  highlights: WebHighlight[];
  highlighterActive: boolean;
}

// --- Templates & Triggers ---

export interface TemplateTrigger {
  type: 'domain' | 'prefix' | 'regex';
  pattern: string;
}

export interface FrontmatterField {
  key: string;
  value: string;
  type?: 'text' | 'list' | 'number' | 'checkbox';
}

export interface ClipTemplate {
  id: string;
  name: string;
  description?: string;
  triggers: TemplateTrigger[];
  clipMode: ClipMode;
  saveMode: SaveMode;
  spaceId?: string;
  dir?: string;
  targetPath?: string;
  dailyPosition?: InsertPosition;
  appendPosition?: InsertPosition;
  titleTemplate: string;
  bodyTemplate: string;
  frontmatter: FrontmatterField[];
  databaseFields?: Record<string, string>;
  downloadImages: boolean;
  includeCover: boolean;
  includeHighlights: boolean;
  autoAI?: boolean;
  aiPrompt?: string;
  openAfterSave?: boolean;
}

export interface ExtensionSettings {
  language: 'auto' | 'zh-CN' | 'en';
  defaultSpaceId: string;
  defaultDownloadImages: boolean;
  defaultOpenAfterSave: boolean;
  defaultHighlightColor: HighlightColor;
  templates: ClipTemplate[];
}

// --- Runtime Messages between Popup / Options / Background / Content ---

export type BgRequest =
  | { type: 'native.call'; action: string; params?: Record<string, unknown> }
  | { type: 'clip.execute'; payload: ExecuteClipPayload }
  | { type: 'tab.extract'; tabId?: number }
  | { type: 'tab.toggleHighlighter'; tabId?: number }
  | { type: 'tab.getHighlights'; url: string }
  | { type: 'tab.saveHighlights'; url: string; highlights: WebHighlight[] }
  | { type: 'tab.clearHighlights'; tabId?: number; url: string };

export interface ExecuteClipPayload {
  tabId?: number;
  pageUrl: string;
  saveParams: ClipSaveParams;
  downloadImages: boolean;
  imageUrls: string[];
  coverUrl?: string;
}

export interface ExecuteClipProgress {
  type: 'clip.progress';
  stage: 'images' | 'saving';
  done: number;
  total: number;
}

export interface ExecuteClipResponse {
  ok: boolean;
  result?: ClipSaveResult;
  live?: boolean;
  imagesDownloaded: number;
  imagesFailed: number;
  error?: string;
}
