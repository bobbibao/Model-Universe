import { AxiosRequestHeaders, AxiosResponse } from 'axios';

export type ToastType = 'success' | 'error' | undefined;
export default class ApiResponse {
  config: AxiosResponse['config'] = {
    headers: {} as AxiosRequestHeaders,
  };
  statusText: string = '';
  statusCode: number = 0;
  displayValidation: boolean = false;
  toastType: ToastType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  systemMessage?: any;
  userMessages?: string[];
  userValidationMessages?: string[];
  errorCode?: string;
  errorParams?: Record<string,string | number>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any = undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(res: AxiosResponse) {
    if (res) {
      if (res.data) {
        this.errorCode = res.data.errorCode;
        this.errorParams = res.data.errorParams;
        if (res.data.userMessages && res.data.userMessages.length > 0) {
          this.userMessages = res.data.userMessages;
        }
        if (res.data.userValidationMessages && res.data.userValidationMessages.length > 0) {
          this.userValidationMessages = res.data.userValidationMessages;
        }
        if (res.data.toastType) {
          this.toastType = res.data.toastType;
        }
        if (res.data.message) {
          this.systemMessage = res.data.message;
        } else this.systemMessage = res.statusText;

        if (res.data.data) {
          this.data = res.data.data;
        } else this.data = res.data;
      }
      if (res.config.headers && res.config.headers['X-Display-Validation']) {
        this.displayValidation = res.config.headers['X-Display-Validation'] === 'true' ? true : false;
      }
      this.statusCode = res.status;
      this.config = res.config;
    }
  }
}
