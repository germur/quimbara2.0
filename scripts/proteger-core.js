// scripts/proteger-core.js
// Hook de PreToolUse para Claude Code

let stdin = '';
process.stdin.on('data', chunk => stdin += chunk);
process.stdin.on('end', () => {
    try {
        const data = JSON.parse(stdin);
        
        // Solo revisamos herramientas que modifiquen archivos o ejecuten comandos
        const modificationTools = [
            'ReplaceFileContent', 'ReplaceFile', 'EditFile', 
            'multi_replace_file_content', 'replace_file_content', 
            'write_to_file', 'run_command', 'Bash', 'WriteToFile'
        ];
        
        if (modificationTools.includes(data.toolName)) {
            // Evaluamos todos los argumentos sin importar el formato JSON
            const argsString = JSON.stringify(data.toolArgs || {}).toLowerCase();
            
            const protectedFiles = [
                'astro.config.mjs',
                'baselayout.astro',
                '[slug].astro',
                'header.astro',
                'footer.astro'
            ];
            
            for (const file of protectedFiles) {
                if (argsString.includes(file)) {
                    // Si detectamos la palabra [slug].astro o baselayout.astro en un intento de edición:
                    console.error(`[ESCUDO SEO / QUIMBARA] 🚨 INTERVENCIÓN: Tienes estrictamente prohibido editar el archivo CORE: ${file}`);
                    console.error(`Este archivo controla la integridad estructural y SEO del blog. Solicita confirmación explícita al humano antes de tocarlo.`);
                    process.exit(1); 
                }
            }
        }
        
        process.exit(0); // Permitir la operación
    } catch (e) {
        process.exit(0); // Si el JSON falla, no bloqueamos la operación
    }
});
