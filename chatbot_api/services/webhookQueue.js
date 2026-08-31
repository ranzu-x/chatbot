// High-Throughput Production Webhook Queue & Background Worker Engine
import pool from "../db.js";
import { broadcastAgentAlert } from "./notificationService.js";

class WebhookQueue {
  constructor(concurrency = 5) {
    this.concurrency = concurrency;
    this.queue = [];
    this.activeWorkers = 0;
    this.stats = {
      totalReceived: 0,
      totalProcessed: 0,
      totalFailed: 0,
      startedAt: new Date(),
    };

    // Auto-worker start
    setInterval(() => this.processNext(), 50);
  }

  enqueue(eventData) {
    const job = {
      id: `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      receivedAt: Date.now(),
      data: eventData,
      retries: 0,
      maxRetries: 3,
    };

    this.queue.push(job);
    this.stats.totalReceived++;
    this.processNext();
    return job.id;
  }

  async processNext() {
    if (this.activeWorkers >= this.concurrency || this.queue.length === 0) {
      return;
    }

    const job = this.queue.shift();
    if (!job) return;

    this.activeWorkers++;

    try {
      await this.executeJob(job);
      this.stats.totalProcessed++;
    } catch (err) {
      console.error(`[QUEUE ERROR] Job ${job.id} failed:`, err.message);
      if (job.retries < job.maxRetries) {
        job.retries++;
        // Re-queue with exponential backoff delay
        setTimeout(() => {
          this.queue.unshift(job);
        }, Math.pow(2, job.retries) * 500);
      } else {
        this.stats.totalFailed++;
      }
    } finally {
      this.activeWorkers--;
      this.processNext();
    }
  }

  async executeJob(job) {
    const { platform, rawPayload, agencyId = 1 } = job.data;
    const latency = Date.now() - job.receivedAt;

    // Simulate/route message processing
    if (rawPayload && (rawPayload.message || rawPayload.text || rawPayload.entry)) {
      const senderName = rawPayload.senderName || "WhatsApp Customer";
      const messageText = rawPayload.text || rawPayload.message || "New inbound message";

      // Trigger agent notification alert
      await broadcastAgentAlert({
        agencyId,
        title: `New message on ${platform || 'Chat'}`,
        body: `${senderName}: "${messageText.slice(0, 80)}"`,
        channel: platform || 'WHATSAPP',
      });
    }

    return { processed: true, latency };
  }

  getStats() {
    const uptimeSec = Math.max(1, Math.round((Date.now() - this.stats.startedAt.getTime()) / 1000));
    return {
      queueLength: this.queue.length,
      activeWorkers: this.activeWorkers,
      concurrency: this.concurrency,
      totalReceived: this.stats.totalReceived,
      totalProcessed: this.stats.totalProcessed,
      totalFailed: this.stats.totalFailed,
      throughputPerSec: Number((this.stats.totalProcessed / uptimeSec).toFixed(2)),
      uptimeSec,
    };
  }
}

export const webhookQueue = new WebhookQueue(10);
