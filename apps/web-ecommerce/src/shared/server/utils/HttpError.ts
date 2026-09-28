// Expected business/validation failure raised by services; controllers turn it into an ApiResponse.
export default class HttpError extends Error {
  statusCode: number;
  validationMessages?: string[];

  constructor(statusCode: number, message: string, validationMessages?: string[]) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.validationMessages = validationMessages;
  }

  static badRequest(message: string, validationMessages?: string[]) {
    return new HttpError(400, message, validationMessages);
  }

  static unauthorized(message = 'Bạn cần đăng nhập để tiếp tục.') {
    return new HttpError(401, message);
  }

  static forbidden(message = 'Bạn không có quyền thực hiện thao tác này.') {
    return new HttpError(403, message);
  }

  static notFound(message = 'Không tìm thấy dữ liệu.') {
    return new HttpError(404, message);
  }

  static conflict(message: string) {
    return new HttpError(409, message);
  }

  static tooManyRequests(message: string) {
    return new HttpError(429, message);
  }
}
