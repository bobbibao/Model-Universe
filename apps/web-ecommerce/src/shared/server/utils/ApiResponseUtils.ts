import { Response } from 'express';

export type ToastType = 'success' | 'error' | undefined;

interface ApiResponseProps<T> {
  statusCode: number;
  toastType: ToastType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  systemMessage?: any;
  userMessages?: string[];
  userValidationMessages?: string[];
  data?: T;
}

export default class ApiResponse<T> {
  private statusCode: number;
  private toastType: ToastType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private systemMessage: any;
  private userMessages: string[];
  private userValidationMessages: string[];
  private data?: T;

  constructor({
    statusCode,
    toastType,
    systemMessage,
    userMessages,
    userValidationMessages,
    data,
  }: ApiResponseProps<T>) {
    this.statusCode = statusCode;
    this.toastType = toastType;
    this.systemMessage = systemMessage;
    this.userMessages = userMessages || [];
    this.userValidationMessages = userValidationMessages || [];
    this.data = data;
  }

  send(res: Response) {
    return res.status(this.statusCode).json({
      statusCode: this.statusCode,
      toastType: this.toastType,
      systemMessage: this.systemMessage,
      userMessages: this.userMessages,
      userValidationMessages: this.userValidationMessages,
      data: this.data,
    });
  }
}
