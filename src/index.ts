import { resolve } from 'node:path';

import { ModuleLoader } from './module';

const filePath = resolve(process.cwd(), 'main.fast');
const moduleLoader = new ModuleLoader();

moduleLoader.executeEntry(filePath);
