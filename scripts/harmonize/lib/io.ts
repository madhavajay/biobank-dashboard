import { createWriteStream, type WriteStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createReadStream } from 'node:fs';

// Buffered line writer — accumulates and flushes in chunks for throughput.
export class LineWriter {
	private stream: WriteStream;
	private buf: string[] = [];
	private n = 0;
	constructor(path: string) {
		this.stream = createWriteStream(path, { encoding: 'utf8' });
	}
	write(line: string) {
		this.buf.push(line);
		if (this.buf.length >= 4096) this.flush();
	}
	writeJson(obj: unknown) {
		this.write(JSON.stringify(obj));
		this.n++;
	}
	private flush() {
		if (this.buf.length) {
			this.stream.write(this.buf.join('\n') + '\n');
			this.buf = [];
		}
	}
	async close(): Promise<number> {
		this.flush();
		await new Promise<void>((res) => this.stream.end(res));
		return this.n;
	}
	get count() {
		return this.n;
	}
}

// Stream a text file line-by-line.
export async function eachLine(path: string, fn: (line: string, i: number) => void): Promise<number> {
	const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
	let i = 0;
	for await (const line of rl) {
		fn(line, i);
		i++;
	}
	return i;
}
