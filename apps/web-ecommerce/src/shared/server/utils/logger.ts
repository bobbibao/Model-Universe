import winston from 'winston';
import { format } from 'winston';
const { combine, timestamp, json } = winston.format;

const tbdLogger = winston.createLogger({
  format: format.combine(format.prettyPrint(), format.colorize(), format.simple(), format.splat()),
  transports: [new winston.transports.Console()],
});

const reset = '\x1b[0m';
const bright = '\x1b[1m';

const red = '\x1b[31m';
const green = '\x1b[32m';
const blue = '\x1b[34m';
const yellow = '\x1b[33m';
const magenta = '\x1b[35m';
const cyan = '\x1b[36m';
const white = '\x1b[37m';
export default class Logger {
  static getLogLevel() {
    const level = process.env.LOG_LEVEL;
    return level;
  }

  static getLogger() {
    const logger = process.env.LOGGER || 'CONSOLE';
    const loglevel = Logger.getLogLevel() || 'debug';
    switch (logger.toUpperCase()) {
      case 'CONSOLE':
        return winston.createLogger({
          format: format.combine(format.prettyPrint(), format.colorize(), format.splat(), format.simple()),
          transports: [new winston.transports.Console({ level: loglevel.toLowerCase() })],
        });
      default:
        return winston.createLogger({
          format: format.combine(format.prettyPrint(), format.colorize(), format.splat(), format.simple()),
          transports: [new winston.transports.Console()],
        });
    }
  }
  static DEBUG(msg: string, obj?: any) {
    const logger = Logger.getLogger();
    const logenv = process.env.LOGGER || 'CONSOLE';
    let message = msg;
    if (logenv.toUpperCase() === 'CONSOLE') {
      message = bright + blue + message;
    }
    if (obj) logger.debug(message + '%o', obj);
    else logger.debug(message);
  }
  static INFO(msg: string, obj?: any) {
    const logger = Logger.getLogger();
    const logenv = process.env.LOGGER || 'CONSOLE';
    let message = msg;
    if (logenv.toUpperCase() === 'CONSOLE') {
      message = bright + green + message;
    }
    if (obj) logger.info(message + '%o', obj);
    else logger.info(message);
  }
  static WARN(msg: string, obj?: any) {
    const logger = Logger.getLogger();
    const logenv = process.env.LOGGER || 'CONSOLE';
    let message = msg;
    if (logenv.toUpperCase() === 'CONSOLE') {
      message = bright + yellow + message;
    }
    if (obj) logger.warn(message + '%o', obj);
    else logger.warn(message);
  }
  static ERROR(msg: string, obj?: any) {
    const logger = Logger.getLogger();
    const logenv = process.env.LOGGER || 'CONSOLE';
    let message = msg;
    if (logenv.toUpperCase() === 'CONSOLE') {
      message = bright + magenta + message;
    }
    if (obj) logger.error(message + '%o', obj);
    else logger.error(message);
  }
}
