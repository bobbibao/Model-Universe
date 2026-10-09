import HttpError from './HttpError';
import { asTrimmedString, isNonEmpty, isValidPhone } from './ValidationUtils';
const MAX_NOTE_LENGTH = 500;
export function validateShipping(data: Record<string, unknown>) {
    const shipping = {
      recipientName: asTrimmedString(data.recipientName),
      phone: asTrimmedString(data.phone),
      address: asTrimmedString(data.address),
      ward: asTrimmedString(data.ward) || null,
      district: asTrimmedString(data.district) || null,
      city: asTrimmedString(data.city),
      note: asTrimmedString(data.note) || null,
    };
    const errors: string[] = [];
    if (!shipping.recipientName) errors.push('Vui lòng nhập tên người nhận.');
    if (!isValidPhone(shipping.phone)) errors.push('Số điện thoại người nhận không hợp lệ.');
    if (!isNonEmpty(shipping.address, 4)) errors.push('Địa chỉ phải có ít nhất 4 ký tự.');
    if (!shipping.city) errors.push('Vui lòng nhập tỉnh/thành phố.');
    if ((shipping.note?.length || 0) > MAX_NOTE_LENGTH) errors.push(`Ghi chú tối đa ${MAX_NOTE_LENGTH} ký tự.`);
    if (errors.length > 0) throw HttpError.badRequest('Thông tin giao hàng chưa hợp lệ.', errors);
    return shipping;
  }

