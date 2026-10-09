import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { router } from './src/shared/server/decorators/controller.decorator';
import Logger from './src/shared/server/utils/logger';
const apiRouter = Router();
const controllersPath = path.join(__dirname, 'src', 'app', 'api');

// Controllers register their routes on the shared `router` through the @Controller decorator
// when their module is imported, so the router only needs to be mounted once.
apiRouter.use(router);

export async function initializeApiRoutes(): Promise<void> {
  for (const file of fs.readdirSync(controllersPath)) {
    const fileName = file.toLowerCase();
    if (!fileName.includes('apibase.controller') && fileName.includes('.controller')) {
      Logger.INFO('Loading controller: ', file);
      // Controllers are CommonJS in production and registered by ts-node in development.
      // Synchronous loading handles native Windows paths and fails startup before accepting traffic.
      require(path.join(controllersPath, file));
    }
  }
}
export default apiRouter;
