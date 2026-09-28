export class ConfigService {
  public async getQueryByKey(queryKey: string): Promise<string | null> {
    const query = '';
    if (!query) return null;
    return query as string;
  }
}

export default ConfigService;
