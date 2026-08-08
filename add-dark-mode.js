import fs from 'fs';
let code = fs.readFileSync('src/App.tsx', 'utf8');

const replacements = {
  'bg-white': 'bg-white dark:bg-slate-900',
  'bg-slate-50': 'bg-slate-50 dark:bg-slate-800/50',
  'bg-slate-100': 'bg-slate-100 dark:bg-slate-800',
  'text-slate-900': 'text-slate-900 dark:text-slate-100',
  'text-slate-800': 'text-slate-800 dark:text-slate-200',
  'text-slate-700': 'text-slate-700 dark:text-slate-300',
  'text-slate-600': 'text-slate-600 dark:text-slate-400',
  'border-slate-100': 'border-slate-100 dark:border-slate-800',
  'border-slate-200': 'border-slate-200 dark:border-slate-700',
  'border-slate-300': 'border-slate-300 dark:border-slate-600',
  'border-gray-50': 'border-gray-50 dark:border-gray-800',
  'border-gray-100': 'border-gray-100 dark:border-gray-800',
  'text-\\[#0f172a\\]': 'text-[#0f172a] dark:text-slate-100',
};

for (const [find, replace] of Object.entries(replacements)) {
  const regex = new RegExp(`\\b${find}\\b(?! dark:)`, 'g');
  code = code.replace(regex, replace);
}

fs.writeFileSync('src/App.tsx', code);
console.log('Added dark mode classes to App.tsx');
