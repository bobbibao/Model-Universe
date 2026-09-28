import { faker } from '@faker-js/faker/locale/vi';
import Logger from '../../../../../shared/server/utils/logger';
import UserModel from '../models/User.Model';
import { hashPassword } from '../../../../../shared/server/utils/PasswordUtils';

const DEV_CUSTOMER_COUNT = 20;
const DEV_CUSTOMER_PASSWORD = 'Customer@123';

const seedAdmin = async (): Promise<void> => {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    Logger.WARN('ADMIN_EMAIL / ADMIN_PASSWORD are not set: no admin account was seeded.');
    return;
  }
  await UserModel.create({
    email,
    passwordHash: await hashPassword(password),
    firstName: 'Admin',
    lastName: 'Clothing Shop',
    role: 'ADMIN',
    isActive: true,
  });
  Logger.INFO(`Admin account seeded: ${email}`);
};

const seedCustomers = async (): Promise<void> => {
  const passwordHash = await hashPassword(DEV_CUSTOMER_PASSWORD);
  const customers = Array.from({ length: DEV_CUSTOMER_COUNT }, (_, index) => {
    const sex = index % 2 === 0 ? 'female' : 'male';
    return {
      email: `customer${index + 1}@example.com`,
      passwordHash,
      firstName: faker.person.firstName(sex),
      lastName: faker.person.lastName(sex),
      phone: `09${faker.string.numeric(8)}`,
      address: `${faker.location.streetAddress()}, ${faker.location.city()}`,
      gender: sex === 'female' ? 'F' : 'M',
      role: 'USER',
      isActive: true,
      createdAt: faker.date.past({ years: 1 }),
    };
  });
  await UserModel.bulkCreate(customers);
  Logger.INFO(`${DEV_CUSTOMER_COUNT} customers seeded (customerN@example.com / ${DEV_CUSTOMER_PASSWORD}).`);
};

export const seedUserData = async (): Promise<void> => {
  try {
    await seedAdmin();
    // Demo customers are only created outside production.
    if (process.env.NODE_ENV !== 'production') {
      await seedCustomers();
    }
    Logger.INFO('users seeding completed.');
  } catch (error) {
    Logger.ERROR('Error seeding the users table:', error);
  }
};
