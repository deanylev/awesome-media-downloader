export enum CancelReason {
  ERROR = 'error',
  ERROR_AUDIO = 'error_audio',
  ERROR_VIDEO = 'error_video',
  TIMEOUT = 'timeout',
  USER = 'user'
}

export enum Environment {
  DEVELOPMENT = 'development',
  PRODUCTION = 'production'
}

export enum LogLevel {
  ERROR = 'error',
  FATAL = 'fatal',
  INFO = 'info',
  WARN = 'warn'
}

export enum Task {
  LOG_CLEANUP = 'log-cleanup'
}

export enum VideoStatus {
  CANCELLED = 'cancelled',
  COMPLETE = 'complete',
  DOWNLOADING = 'downloading',
  ERROR = 'error',
  INVALID = 'invalid',
  PROCESSING = 'processing'
}
