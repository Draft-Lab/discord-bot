import { join } from "node:path"
import { createStorage } from "unstorage"
import fsDriver from "unstorage/drivers/fs"

// Create storage instance with memory driver for now
// Can easily migrate to other drivers (redis, fs, etc) later
export const storage = createStorage({
	driver: fsDriver({
		base: join(process.cwd(), ".storage")
	})
})
