// Expected business/validation failure raised by services; controllers turn it into an ApiResponse.
export default class HttpError extends Error {
  statusCode: number;
  validationMessages?: string[];
  code?: string;
  params?: Record<string,string | number>;

  constructor(statusCode: number, message: string, validationMessages?: string[], code?: string, params?: Record<string,string | number>) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.validationMessages = validationMessages;
    this.code = code;
    this.params = params;
  }

  static badRequest(message: string, validationMessages?: string[], code?: string) {
    return new HttpError(400, message, validationMessages, code);
  }

  static unauthorized(message = 'Sign in to continue.') {
    return new HttpError(401, message, undefined, 'AUTH_REQUIRED');
  }

  static forbidden(message = 'You are not permitted to perform this action.') {
    return new HttpError(403, message, undefined, 'FORBIDDEN');
  }

  static notFound(message = 'The requested record was not found.') {
    return new HttpError(404, message, undefined, 'NOT_FOUND');
  }

  static conflict(message: string, code?: string) {
    return new HttpError(409, message, undefined, code);
  }

  static policyApprovalRequired(domain: string) {
    return new HttpError(409, `An approved ${domain} policy is required before this transaction.`, undefined, 'POLICY_APPROVAL_REQUIRED', { domain });
  }

  static tooManyRequests(message: string) {
    return new HttpError(429, message);
  }
}
