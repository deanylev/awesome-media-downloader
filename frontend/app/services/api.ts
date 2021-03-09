import Service from '@ember/service';

import { VideoStatus } from 'awesome-media-downloader/lib/enums';

type HttpMethod = 'GET' | 'POST' | 'PUT';

export default class ApiService extends Service {
  cancelDownload(videoId: string): Promise<null> {
    return this.doRequest('PUT', `cancel/${videoId}`);
  }

  private async doRequest(method: HttpMethod, endpoint: string, data: Record<string, unknown> = {}) {
    const isGet = method === 'GET';
    const urlQuery = isGet
      ? new URLSearchParams(data as Record<string, string>).toString()
      : '';
    const response = await fetch(`/api/v1/${endpoint}?${urlQuery}`, {
      ...!isGet && {
        body: JSON.stringify(data)
      },
      headers: {
        'Content-Type': 'application/json'
      },
      method
    });
    if (response.ok) {
      try {
        return await response.json();
      } catch {
        return null;
      }
    }

    throw response.status;
  }

  pollDownload(videoId: string): Promise<{ progress: number, status: VideoStatus }> {
    return this.doRequest('GET', `poll/${videoId}`);
  }

  startDownload(url: string): Promise<{ id: string, thumbnail: string, title: string }> {
    return this.doRequest('POST', 'download', {
      url
    });
  }
}
