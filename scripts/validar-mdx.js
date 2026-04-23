// scripts/validar-mdx.js
// Hook de PostToolUse para Claude Code

const fs = require('fs');
const path = require('path');

let stdin = '';
process.stdin.on('data', chunk => stdin += chunk);
process.stdin.on('end', () => {
    try {
        const data = JSON.parse(stdin);

        // Si la herramienta falló, no hacemos validación MDX porque no hay archivo nuevo real o hay un error previo
        if (data.toolResult && data.toolResult.isError) {
            process.exit(0);
        }

        // Buscar el archivo objetivo en los argumentos de la herramienta
        const argsStr = JSON.stringify(data.toolArgs || {});
        const matchFile = argsStr.match(/(src[\\\/]content[\\\/]blog[\\\/][^"'\\]+\.mdx?)/i);
        
        if (!matchFile) {
            process.exit(0); // No es un archivo MDX del blog
        }

        let targetFile = matchFile[1].replace(/\\\\/g, '\\');
        // Asegurarnos de que existe el archivo antes de leer
        if (!fs.existsSync(targetFile)) {
            process.exit(0);
        }

        const content = fs.readFileSync(targetFile, 'utf-8');

        // Validaciones SEO y formato según requerimientos
        let errors = [];

        // 1. Enlaces estilo Obsidian
        if (content.includes('[[')) {
            errors.push("❌ Detectadas alucinaciones tipo Obsidian ('[['). Usa formato Markdown estándar '[texto](url)'.");
        }

        // 2. Extraer y validar el Title del Frontmatter
        const titleMatch = content.match(/^title:\s*["'](.*?)["']/m);
        if (titleMatch) {
            const titleLength = titleMatch[1].length;
            if (titleLength > 100) {
                errors.push(`❌ Título excede los 100 caracteres permitidos (${titleLength} char).`);
            }
        }

        // 3. Extraer y validar Description del Frontmatter
        const descMatch = content.match(/^description:\s*["'](.*?)["']/m);
        if (descMatch) {
            const descLength = descMatch[1].length;
            if (descLength > 160) {
                errors.push(`❌ Descripción excede los 160 caracteres para Snippet de Google (${descLength} char).`);
            }
        }

        if (errors.length > 0) {
            // Imprimimos el error; Claude lo interceptará y sabrá que fracasó el control de calidad
            console.error(`\n[VALIDADOR SEO / ZOD] ALERTA DE CALIDAD EN ${path.basename(targetFile)}:`);
            errors.forEach(err => console.error(err));
            console.error('El script de post-verificación requiere que corrijas esto antes de finalizar la tarea.\n');
            process.exit(1);
        }

        process.exit(0);
    } catch (e) {
        process.exit(0);
    }
});
