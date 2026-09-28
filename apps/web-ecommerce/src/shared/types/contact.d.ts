export type ContactMessageStatus = 'NEW' | 'HANDLED';

export type ContactMessageInput = {
  name: string;
  email: string;
  phone: string;
  company: string;
  message: string;
};

export type ContactMessage = ContactMessageInput & {
  id: number;
  status: ContactMessageStatus;
  createdAt: string;
};
