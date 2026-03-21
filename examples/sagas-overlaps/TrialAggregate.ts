import { AbstractAggregate } from '../../src/index.ts';

type ProvisionTrialPayload = { email: string };

export class TrialAggregate extends AbstractAggregate<void> {
	provisionTrial(payload: ProvisionTrialPayload) {
		console.log('provisionTrial command (received by TrialAggregate):', this.command);
		this.emit('trialProvisioned', { email: payload.email });
	}
}
