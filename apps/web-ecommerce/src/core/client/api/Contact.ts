'use client';

import Api from './Api';
import { ADMIN_CONTACT_API, CONTACT_API } from './endpoint';
import type { PaginatedResult } from '@/shared/types/pagination';
import type { ContactMessage, ContactMessageInput, ContactMessageStatus } from '@/shared/types/contact';

export default class ContactApi {
  static async sendMessage(input: ContactMessageInput): Promise<boolean> {
    try {
      await Api.post(CONTACT_API.SEND_MESSAGE, input);
      return true;
    } catch (error) {
      return false;
    }
  }

  static async getMessages(params: {
    q?: string;
    status?: ContactMessageStatus | '';
    page?: number;
    per_page?: number;
  }): Promise<PaginatedResult<ContactMessage> | undefined> {
    try {
      const response = await Api.get(ADMIN_CONTACT_API.GET_MESSAGES, { params });
      return response.data?.payload;
    } catch (error) {
      return undefined;
    }
  }

  static async updateStatus(messageId: number, status: ContactMessageStatus): Promise<ContactMessage | undefined> {
    try {
      const response = await Api.put(ADMIN_CONTACT_API.UPDATE_STATUS(messageId), { status });
      return response.data;
    } catch (error) {
      return undefined;
    }
  }
}
