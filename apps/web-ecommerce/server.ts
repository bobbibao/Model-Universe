import e, { NextFunction, Request, Response } from 'express';
import next from 'next';
import apiRouter from './apiRouter';
import Logger from './src/shared/server/utils/logger';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import DatabaseProvider from './src/core/server/database/Database.Provider';
import { AuthenticationMiddleware } from './src/core/server/middleware/Authentication.Middleware';
import { LoginRateLimitMiddleware } from './src/core/server/middleware/LoginRateLimit.Middleware';
import { AgentServiceAuthMiddleware } from './src/core/server/middleware/AgentServiceAuth.Middleware';
import FileStorageService, { PUBLIC_UPLOAD_PREFIX } from './src/core/server/services/FileStorageService';
import ApiResponse from './src/shared/server/utils/ApiResponseUtils';
import ReservationReminderService from './src/core/server/services/ReservationReminderService';
import { assertMarketingConfig } from './src/core/server/services/marketing/platforms';

if (!process.env.NEXT_MANUAL_SIG_HANDLE) {
  process.on('SIGTERM', () => process.exit(0));
  process.on('SIGINT', () => process.exit(0));
}

// A live ad platform or conversion API without its credentials stops the server here, not on the first request.
assertMarketingConfig();

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

Logger.INFO('Starting server...');

app
  .prepare()
  .then(() => {
    // initialize the manager database connection
    return DatabaseProvider.initialize();
  })

  .then(() => {
    // Database initialization successful, now setup the server
    const server = e();

    server.use(bodyParser.json());
    server.use(bodyParser.urlencoded({ extended: true }));
    server.use(cookieParser());

    if (!process.env.JWT_SECRET) {
      Logger.ERROR('JWT_SECRET is not set: login and registration will fail until it is configured.');
    }

    // Brute-force protection for sign-in (runs before the auth controller).
    server.post('/api/auth/login', LoginRateLimitMiddleware);

    // Agent API for the shop agent: service token instead of a user session.
    server.use('/api/agent/v1', AgentServiceAuthMiddleware);

    server.use('/api', AuthenticationMiddleware, apiRouter);

    // Unknown API paths answer with the JSON envelope instead of falling through to Next.js.
    server.use('/api', (_req: Request, res: Response) => {
      new ApiResponse({ statusCode: 404, toastType: 'error', userMessages: ['Không tìm thấy API.'] }).send(res);
    });

    // Errors raised before a controller handles the request (e.g. malformed JSON body) also use the envelope.
    server.use(
      '/api',
      (error: { type?: string; status?: number }, _req: Request, res: Response, nextFn: NextFunction) => {
        if (res.headersSent) return nextFn(error);
        const isClientError = error?.type === 'entity.parse.failed' || error?.type === 'entity.too.large';
        if (!isClientError) Logger.ERROR('Unhandled API error:', error);
        const statusCode = isClientError ? error.status || 400 : 500;
        const message = isClientError ? 'Dữ liệu gửi lên không hợp lệ.' : 'Đã có lỗi xảy ra, vui lòng thử lại sau.';
        new ApiResponse({ statusCode, toastType: 'error', userMessages: [message] }).send(res);
      },
    );

    // Uploaded images (product photos) stored on local disk
    server.use(
      PUBLIC_UPLOAD_PREFIX,
      e.static(FileStorageService.getUploadRoot(), { index: false, maxAge: '7d', fallthrough: false }),
    );

    // Handle API routes
    server.get('*', (req, res) => {
      return handle(req, res);
    });

    const reminders = new ReservationReminderService();
    const remind = () => Promise.allSettled([reminders.run()]).then(results => {
      results.forEach((result, index) => {
        if (result.status === 'rejected') Logger.ERROR(`${index === 0 ? 'Reservation' : 'Pawn'} reminders failed:`, result.reason);
      });
    });
    void remind();
    setInterval(() => void remind(), 60_000).unref();

    // Start the server
    const port = process.env.PORT || 3000;
    server
      .listen(port, () => {
        Logger.INFO(`> Ready on http://localhost:${port} - Environment: ${process.env.NODE_ENV}`);
      })
      .on('error', (error) => {
        // e.g. EADDRINUSE: fail loudly instead of leaving a half-started process behind
        Logger.ERROR('Could not start the HTTP server:', error);
        process.exit(1);
      });
  })

  .catch((ex: any) => {
    // Handle any errors that occurred during preparation or database initialization
    Logger.ERROR('An error occurred during server startup:', ex);
    process.exit(1);
  });
