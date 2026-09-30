import { WhereOptions } from 'sequelize';
import AgentTaskModel, { AgentTaskStatus } from '../database/client/models/AgentTask.Model';
import HttpError from '../../../shared/server/utils/HttpError';
import { asTrimmedString } from '../../../shared/server/utils/ValidationUtils';

const STATUSES: AgentTaskStatus[] = ['OPEN', 'DONE', 'CANCELLED'];
// Staff can finish a task or reopen it; cancelling belongs to the agent (revert).
const SETTABLE_STATUSES: AgentTaskStatus[] = ['OPEN', 'DONE'];

// Tasks created by the agent (Agent API POST /tasks), handled by staff on /admin/agent/tasks.
export default class AgentTaskService {
  async list(status: string | undefined, limit: number, offset: number) {
    const where: WhereOptions = STATUSES.includes(status as AgentTaskStatus) ? { status } : {};
    return AgentTaskModel.findAndCountAll({
      attributes: ['id', 'title', 'assigneeRole', 'description', 'dueAt', 'status', 'createdAt'],
      where,
      // Postgres orders an ENUM by declaration order: open tasks first.
      order: [
        ['status', 'ASC'],
        ['createdAt', 'DESC'],
      ],
      limit,
      offset,
    });
  }

  async updateStatus(id: number, rawStatus: unknown) {
    const status = asTrimmedString(rawStatus) as AgentTaskStatus;
    if (!SETTABLE_STATUSES.includes(status)) throw HttpError.badRequest('Trạng thái công việc không hợp lệ.');
    const task = await AgentTaskModel.findByPk(id);
    if (!task) throw HttpError.notFound('Không tìm thấy công việc.');
    if (task.status === 'CANCELLED') throw HttpError.badRequest('Công việc đã bị huỷ, không thể cập nhật.');
    await task.update({ status });
    return task;
  }
}
