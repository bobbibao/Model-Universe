'use client';

import axios from 'axios';
import { withoutLocale } from '@/i18n/config';
import englishErrors from '@/messages/errors/en.json';
import vietnameseErrors from '@/messages/errors/vi.json';
import * as querystring from 'querystring';
import { toast } from 'react-toastify';
import { trackPromise } from 'react-promise-tracker';
import ApiResponse from '@/shared/client/utils/ApiResponseUtils';
import camelCaseKeys from 'camelcase-keys';
import { Events, eventEmitter } from '@/shared/client/utils/eventEmitter';

function axiosCreate(baseUrl: string) {
  return axios.create({
    baseURL: baseUrl,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    },
    paramsSerializer: (params) => querystring.stringify(params),
  });
}

const axiosInstance = axiosCreate('/api/');
axiosInstance.interceptors.request.use(config => { config.headers['Accept-Language'] = document.documentElement.lang === 'en' ? 'en' : 'vi'; return config; });
const errorMessage = (code: string) => {
  const messages: Record<string,string> = document.documentElement.lang === 'en' ? englishErrors : vietnameseErrors;
  return messages[code];
};
axiosInstance.interceptors.response.use(
  function (response) {
    const apiResponse = new ApiResponse(response);

    if (apiResponse.data) apiResponse.data = camelCaseKeys(apiResponse.data, { deep: true });

    if (apiResponse.toastType === 'error')
      if (apiResponse.userMessages) {
        const messages = Array.isArray(apiResponse.userMessages)
          ? apiResponse.userMessages
          : [apiResponse.userMessages];
        const singleLine = messages.join('\n');
        toast.error(singleLine, { autoClose: false });
      }

    if (apiResponse.displayValidation && apiResponse.userValidationMessages) {
      const validationModalProps = {
        title: 'Validation Modal',
        show: true,
        validationMessages: apiResponse.userValidationMessages,
        onClose: () => {
          // define what should happen when the modal is closed
        },
      };

      eventEmitter.dispatch(Events.OPEN_MODAL_MESSAGES_ERRORS, validationModalProps);
    }

    if (apiResponse.toastType === 'success' && apiResponse.userMessages) {
      toast.success(apiResponse.userMessages.join('\n'));
    }

    return {
      ...response,
      data: apiResponse.data,
    };
  },
  function (error) {
    const apiResponse = new ApiResponse(error.response);
    if (apiResponse.errorCode && errorMessage(apiResponse.errorCode)) apiResponse.userMessages = [errorMessage(apiResponse.errorCode)];
    if (apiResponse.statusCode === 401) {
      // Session missing or expired: send the user to sign in and come back afterwards.
      // localStorage is kept on purpose (it holds the guest cart).
      toast.dismiss();
      toast.error(apiResponse.userMessages?.join('\n') || errorMessage('AUTH_REQUIRED'));
      const { pathname, search } = window.location;
      if (!withoutLocale(pathname).startsWith('/auth/')) {
        window.location.assign(`/${document.documentElement.lang === 'en' ? 'en' : 'vi'}/auth/signin?redirect=${encodeURIComponent(pathname + search)}`);
      }
      return Promise.reject(error);
    }

    if (apiResponse.userValidationMessages) {
      eventEmitter.dispatch(Events.OPEN_MODAL_MESSAGES_ERRORS, {
        title: apiResponse.userMessages?.join('\n'),
        validationMessages: apiResponse.userValidationMessages,
      });
    } else if (apiResponse.userMessages) {
      // The message doubles as the toast id, so a page whose parallel requests fail for the same reason (e.g. the
      // AI service is down) shows it once instead of once per request.
      const message = apiResponse.userMessages.join('\n');
      toast.error(message, { toastId: message });
    } else {
      const message = errorMessage('NETWORK_ERROR');
      toast.error(message, { toastId: message, autoClose: false });
    }
    return Promise.reject(error);
  },
);

const Api: any = {
  ...axiosInstance,
  get: (...args: Parameters<typeof axiosInstance.get>) => trackPromise(axiosInstance.get(...args)),
  post: (...args: Parameters<typeof axiosInstance.post>) => trackPromise(axiosInstance.post(...args)),
  put: (...args: Parameters<typeof axiosInstance.put>) => trackPromise(axiosInstance.put(...args)),
  delete: (...args: Parameters<typeof axiosInstance.delete>) => trackPromise(axiosInstance.delete(...args)),
};

export default Api;
