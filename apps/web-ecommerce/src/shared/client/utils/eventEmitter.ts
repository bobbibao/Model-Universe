/* eslint-disable @typescript-eslint/no-explicit-any */
// file.ts
export enum Events {
  OPEN_MODAL_MESSAGES_ERRORS = 'openModalMessagesErrors',
}

export const eventEmitter = {
  _events: {} as any,
  dispatch(event: Events, data: any) {
    if (!this._events[event]) return;
    this._events[event].forEach((callback: (data: any) => any) => callback(data));
  },
  subscribe(event: Events, callback: (data: any) => any) {
    if (!this._events[event]) this._events[event] = [];
    this._events[event].push(callback);
  },
  unsubscribe(event: Events) {
    if (!this._events[event]) return;
    delete this._events[event];
  },
};
