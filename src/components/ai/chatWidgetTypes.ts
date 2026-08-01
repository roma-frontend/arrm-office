// SpeechRecognition type declarations
export interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

export interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

export interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

export interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

export interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: Event) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

export interface ConflictMessage {
  title: string;
  message: string;
  suggestion: string;
}

export interface BookingState {
  status: 'pending' | 'booked' | 'conflict' | 'loading';
  result?: string;
  conflicts?: ConflictMessage[];
  alternativeDates?: string[];
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  actions?: AnyAction[];
  bookingStates?: Record<number, BookingState>;
  suggestions?: string[];
}

export interface BookLeaveAction {
  type: 'BOOK_LEAVE';
  leaveType: 'paid' | 'sick' | 'family' | 'unpaid' | 'doctor';
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
}

export interface EditLeaveAction {
  type: 'EDIT_LEAVE';
  leaveId: string;
  employeeName: string;
  startDate: string;
  endDate: string;
  days: number;
  reason?: string;
  leaveType: string;
}

export interface DeleteLeaveAction {
  type: 'DELETE_LEAVE';
  leaveId: string;
  employeeName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
}

export interface BookDriverAction {
  type: 'BOOK_DRIVER';
  driverId: string;
  driverName: string;
  startTime: string;
  endTime: string;
  from: string;
  to: string;
  purpose: string;
  passengerCount: number;
  notes?: string;
}

export interface BackupOrgAction {
  type: 'BACKUP_ORG';
  organizationId: string;
  organizationName: string;
}

export interface BackupEmployeeAction {
  type: 'BACKUP_EMPLOYEE';
  organizationId: string;
  userId: string;
  userName: string;
}

export interface RestoreBackupAction {
  type: 'RESTORE_BACKUP';
  backupId: string;
  employeeName: string;
}

export type AnyAction =
  | BookLeaveAction
  | EditLeaveAction
  | DeleteLeaveAction
  | BookDriverAction
  | BackupOrgAction
  | BackupEmployeeAction
  | RestoreBackupAction;
