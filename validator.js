const fs = require('fs');
const path = require('path');

// Schema definitions
const zonesSchema = {
    globalSettings: {
        required: ['systemEnabled', 'checkInterval', 'maxEntitiesPerZone', 'entityLifetime', 'minSpawnDistanceFromPlayer'],
        types: {
            systemEnabled: 'number',
            checkInterval: 'number',
            maxEntitiesPerZone: 'number',
            entityLifetime: 'number',
            minSpawnDistanceFromPlayer: 'number'
        }
    },
    zones: {
        required: ['name', 'enabled', 'position', 'triggerRadius', 'spawnChance', 'despawnOnExit', 'despawnDistance', 'respawnCooldown', 'spawnPoints'],
        types: {
            name: 'string',
            enabled: 'number',
            position: 'string',
            triggerRadius: 'number',
            spawnChance: 'number',
            despawnOnExit: 'number',
            despawnDistance: 'number',
            respawnCooldown: 'number',
            spawnPoints: 'array'
        },
        spawnPoints: {
            required: ['position', 'radius', 'tierIds', 'entities', 'useFixedHeight'],
            types: {
                position: 'string',
                radius: 'number',
                tierIds: 'array',
                entities: 'number',
                useFixedHeight: 'number'
            }
        }
    }
};

const tiersSchema = {
    tiers: {
        required: ['name', 'classnames'],
        types: {
            name: 'string',
            classnames: 'array'
        }
    }
};

// Helper function to find line numbers in JSON text
function findLineNumber(text, searchTerm, contextInfo = '') {
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(searchTerm) || (contextInfo && lines[i].includes(contextInfo))) {
            return i + 1;
        }
    }
    return null;
}

// Helper function to get precise line number for nested objects
function getLineNumberForPath(text, path) {
    const lines = text.split('\n');
    let searchPattern;
    
    if (path.includes('globalSettings')) {
        searchPattern = '"globalSettings"';
    } else if (path.includes('zones[') && path.includes('].name')) {
        const zoneIndex = path.match(/zones\[(\d+)\]/)[1];
        searchPattern = `"name".*zone.*${parseInt(zoneIndex) + 1}`;
    } else if (path.includes('spawnPoints[')) {
        searchPattern = '"spawnPoints"';
    }
    
    for (let i = 0; i < lines.length; i++) {
        if (searchPattern && lines[i].includes(searchPattern.replace(/.*/, ''))) {
            return i + 1;
        }
    }
    return null;
}

// Validation functions
function validateType(value, expectedType) {
    switch (expectedType) {
        case 'string': return typeof value === 'string';
        case 'number': return typeof value === 'number' && !isNaN(value);
        case 'array': return Array.isArray(value);
        case 'object': return typeof value === 'object' && value !== null && !Array.isArray(value);
        default: return false;
    }
}

function validatePosition(position) {
    if (typeof position !== 'string') return false;
    
    // DayZ positions are space-separated: "x.x y.y z.z" or "xx yy zz"
    const coords = position.trim().split(/\s+/); // Split by one or more whitespace characters
    
    if (coords.length !== 3) return false;
    
    // Check if each coordinate is a valid number (can be integer or float)
    return coords.every(coord => {
        const num = parseFloat(coord);
        return !isNaN(num) && isFinite(num);
    });
}

function generateFixSuggestion(error, data) {
    const fixes = [];
    
    if (error.includes('Missing required field')) {
        const field = error.match(/'([^']+)'/)[1];
        const defaultValues = {
            'systemEnabled': 1,
            'checkInterval': 5.0,
            'maxEntitiesPerZone': 20,
            'entityLifetime': 600,
            'minSpawnDistanceFromPlayer': 30.0,
            'enabled': 1,
            'triggerRadius': 300.0,
            'spawnChance': 1.0,
            'despawnOnExit': 1,
            'despawnDistance': 50.0,
            'respawnCooldown': 10.0,
            'spawnPoints': [],
            'radius': 2.0,
            'tierIds': [1],
            'entities': 3,
            'useFixedHeight': 1,
            'name': 'DefaultName',
            'classnames': ['ZmbM_CitizenASkinny']
        };
        fixes.push(`Add: "${field}": ${JSON.stringify(defaultValues[field] || 'VALUE_NEEDED')}`);
    }
    
    if (error.includes('Invalid type')) {
        const field = error.match(/'([^']+)'/)[1];
        const expectedType = error.match(/Expected (\w+)/)[1];
        fixes.push(`Change type of '${field}' to ${expectedType}`);
    }
    
    if (error.includes('Invalid position format')) {
        fixes.push('Use format: "x.x y.y z.z" (e.g., "1234.5 10.0 5678.9")');
    }
    
    return fixes;
}

function validateZones(data, originalText) {
    const errors = [];
    const fixes = [];
    
    // Validate root structure
    if (!data.globalSettings) {
        const lineNum = findLineNumber(originalText, 'globalSettings') || 1;
        const error = `Line ${lineNum}: Missing 'globalSettings' object`;
        errors.push(error);
        fixes.push({
            error: error,
            suggestions: generateFixSuggestion(error, data),
            zoneName: 'ROOT'
        });
    } else {
        // Validate globalSettings
        const gs = data.globalSettings;
        for (const field of zonesSchema.globalSettings.required) {
            if (!(field in gs)) {
                const lineNum = findLineNumber(originalText, 'globalSettings') || 1;
                const error = `Line ${lineNum}: Missing required field '${field}' in globalSettings`;
                errors.push(error);
                fixes.push({
                    error: error,
                    suggestions: generateFixSuggestion(error, data),
                    zoneName: 'GLOBAL_SETTINGS'
                });
            } else if (!validateType(gs[field], zonesSchema.globalSettings.types[field])) {
                const lineNum = findLineNumber(originalText, field, 'globalSettings') || 1;
                const error = `Line ${lineNum}: Invalid type for '${field}' in globalSettings. Expected ${zonesSchema.globalSettings.types[field]}, got ${typeof gs[field]}`;
                errors.push(error);
                fixes.push({
                    error: error,
                    suggestions: generateFixSuggestion(error, data),
                    zoneName: 'GLOBAL_SETTINGS'
                });
            }
        }
    }

    if (!data.zones || !Array.isArray(data.zones)) {
        const lineNum = findLineNumber(originalText, 'zones') || 1;
        const error = `Line ${lineNum}: Missing or invalid 'zones' array`;
        errors.push(error);
        fixes.push({
            error: error,
            suggestions: ['Add: "zones": []'],
            zoneName: 'ROOT'
        });
        return { errors, fixes };
    }

    // Validate zones
    data.zones.forEach((zone, zoneIndex) => {
        const zoneName = zone.name || `Zone_${zoneIndex + 1}`;
        
        for (const field of zonesSchema.zones.required) {
            if (!(field in zone)) {
                const lineNum = findLineNumber(originalText, `"name": "${zone.name}"`) || 
                               findLineNumber(originalText, `zones.*${zoneIndex}`) || 
                               (zoneIndex * 15) + 10; // Rough estimate
                const error = `Line ${lineNum}: Missing required field '${field}' in zone '${zoneName}'`;
                errors.push(error);
                fixes.push({
                    error: error,
                    suggestions: generateFixSuggestion(error, data),
                    zoneName: zoneName
                });
            } else if (field === 'spawnPoints') {
                if (!Array.isArray(zone.spawnPoints)) {
                    const lineNum = findLineNumber(originalText, 'spawnPoints', zone.name) || (zoneIndex * 15) + 12;
                    const error = `Line ${lineNum}: 'spawnPoints' must be an array in zone '${zoneName}'`;
                    errors.push(error);
                    fixes.push({
                        error: error,
                        suggestions: ['Change to: "spawnPoints": []'],
                        zoneName: zoneName
                    });
                }
            } else if (field === 'position') {
                if (!validatePosition(zone.position)) {
                    const lineNum = findLineNumber(originalText, zone.position) || (zoneIndex * 15) + 11;
                    const error = `Line ${lineNum}: Invalid position format '${zone.position}' in zone '${zoneName}'. Expected format: 'x y z'`;
                    errors.push(error);
                    fixes.push({
                        error: error,
                        suggestions: generateFixSuggestion(error, data),
                        zoneName: zoneName
                    });
                }
            } else if (!validateType(zone[field], zonesSchema.zones.types[field])) {
                const lineNum = findLineNumber(originalText, `"${field}"`, zone.name) || (zoneIndex * 15) + 10;
                const error = `Line ${lineNum}: Invalid type for '${field}' in zone '${zoneName}'. Expected ${zonesSchema.zones.types[field]}, got ${typeof zone[field]}`;
                errors.push(error);
                fixes.push({
                    error: error,
                    suggestions: generateFixSuggestion(error, data),
                    zoneName: zoneName
                });
            }
        }

        // Validate spawn points
        if (zone.spawnPoints && Array.isArray(zone.spawnPoints)) {
            zone.spawnPoints.forEach((sp, spIndex) => {
                for (const field of zonesSchema.zones.spawnPoints.required) {
                    if (!(field in sp)) {
                        const lineNum = findLineNumber(originalText, 'spawnPoints') + spIndex + 2 || (zoneIndex * 15) + 13 + spIndex;
                        const error = `Line ${lineNum}: Missing required field '${field}' in spawn point ${spIndex + 1} of zone '${zoneName}'`;
                        errors.push(error);
                        fixes.push({
                            error: error,
                            suggestions: generateFixSuggestion(error, data),
                            zoneName: `${zoneName} > SpawnPoint_${spIndex + 1}`
                        });
                    } else if (field === 'position') {
                        if (!validatePosition(sp.position)) {
                            const lineNum = findLineNumber(originalText, sp.position) || (zoneIndex * 15) + 14 + spIndex;
                            const error = `Line ${lineNum}: Invalid position format '${sp.position}' in spawn point ${spIndex + 1} of zone '${zoneName}'. Expected format: 'x y z'`;
                            errors.push(error);
                            fixes.push({
                                error: error,
                                suggestions: generateFixSuggestion(error, data),
                                zoneName: `${zoneName} > SpawnPoint_${spIndex + 1}`
                            });
                        }
                    } else if (field === 'tierIds') {
                        if (!Array.isArray(sp.tierIds) || sp.tierIds.some(id => typeof id !== 'number')) {
                            const lineNum = findLineNumber(originalText, 'tierIds') || (zoneIndex * 15) + 15 + spIndex;
                            const error = `Line ${lineNum}: 'tierIds' must be an array of numbers in spawn point ${spIndex + 1} of zone '${zoneName}'`;
                            errors.push(error);
                            fixes.push({
                                error: error,
                                suggestions: ['Example: "tierIds": [1, 2]'],
                                zoneName: `${zoneName} > SpawnPoint_${spIndex + 1}`
                            });
                        }
                    } else if (!validateType(sp[field], zonesSchema.zones.spawnPoints.types[field])) {
                        const lineNum = findLineNumber(originalText, `"${field}"`) || (zoneIndex * 15) + 14 + spIndex;
                        const error = `Line ${lineNum}: Invalid type for '${field}' in spawn point ${spIndex + 1} of zone '${zoneName}'. Expected ${zonesSchema.zones.spawnPoints.types[field]}, got ${typeof sp[field]}`;
                        errors.push(error);
                        fixes.push({
                            error: error,
                            suggestions: generateFixSuggestion(error, data),
                            zoneName: `${zoneName} > SpawnPoint_${spIndex + 1}`
                        });
                    }
                }
            });
        }
    });

    return { errors, fixes };
}

function validateTiers(data, originalText) {
    const errors = [];
    const fixes = [];

    if (!data.tiers || typeof data.tiers !== 'object') {
        const lineNum = findLineNumber(originalText, 'tiers') || 1;
        const error = `Line ${lineNum}: Missing or invalid 'tiers' object`;
        errors.push(error);
        fixes.push({
            error: error,
            suggestions: ['Add: "tiers": {}'],
            zoneName: 'ROOT'
        });
        return { errors, fixes };
    }

    Object.keys(data.tiers).forEach((tierId, index) => {
        const tier = data.tiers[tierId];
        const tierName = `Tier_${tierId}`;

        if (!validateType(tierId, 'string') || !/^\d+$/.test(tierId)) {
            const lineNum = findLineNumber(originalText, `"${tierId}"`) || (index * 5) + 3;
            const error = `Line ${lineNum}: Tier ID '${tierId}' should be a numeric string`;
            errors.push(error);
            fixes.push({
                error: error,
                suggestions: ['Use numeric strings like "1", "2", "3"'],
                zoneName: tierName
            });
        }

        for (const field of tiersSchema.tiers.required) {
            if (!(field in tier)) {
                const lineNum = findLineNumber(originalText, `"${tierId}"`) + 1 || (index * 5) + 4;
                const error = `Line ${lineNum}: Missing required field '${field}' in ${tierName}`;
                errors.push(error);
                fixes.push({
                    error: error,
                    suggestions: generateFixSuggestion(error, data),
                    zoneName: tierName
                });
            } else if (field === 'classnames') {
                if (!Array.isArray(tier.classnames)) {
                    const lineNum = findLineNumber(originalText, 'classnames', tierId) || (index * 5) + 5;
                    const error = `Line ${lineNum}: 'classnames' must be an array in ${tierName}`;
                    errors.push(error);
                    fixes.push({
                        error: error,
                        suggestions: ['Example: "classnames": ["ZmbM_CitizenASkinny"]'],
                        zoneName: tierName
                    });
                } else if (tier.classnames.some(name => typeof name !== 'string')) {
                    const lineNum = findLineNumber(originalText, 'classnames', tierId) || (index * 5) + 5;
                    const error = `Line ${lineNum}: All 'classnames' must be strings in ${tierName}`;
                    errors.push(error);
                    fixes.push({
                        error: error,
                        suggestions: ['Example: ["ZmbM_CitizenASkinny", "ZmbF_SurvivorNormal_Blue"]'],
                        zoneName: tierName
                    });
                } else if (tier.classnames.length === 0) {
                    const lineNum = findLineNumber(originalText, 'classnames', tierId) || (index * 5) + 5;
                    const error = `Line ${lineNum}: 'classnames' array cannot be empty in ${tierName}`;
                    errors.push(error);
                    fixes.push({
                        error: error,
                        suggestions: ['Add at least one classname'],
                        zoneName: tierName
                    });
                }
            } else if (!validateType(tier[field], tiersSchema.tiers.types[field])) {
                const lineNum = findLineNumber(originalText, `"${field}"`, tierId) || (index * 5) + 4;
                const error = `Line ${lineNum}: Invalid type for '${field}' in ${tierName}. Expected ${tiersSchema.tiers.types[field]}, got ${typeof tier[field]}`;
                errors.push(error);
                fixes.push({
                    error: error,
                    suggestions: generateFixSuggestion(error, data),
                    zoneName: tierName
                });
            }
        }
    });

    return { errors, fixes };
}

function createFixedFiles(filename, originalData, fixes, type) {
    const fixesDir = 'validation_fixes';
    if (!fs.existsSync(fixesDir)) {
        fs.mkdirSync(fixesDir);
    }

    // Create a copy of the original data for fixes
    let fixedData = JSON.parse(JSON.stringify(originalData));
    
    // Apply automatic fixes where possible
    fixes.forEach(fix => {
        if (fix.suggestions.some(s => s.includes('Add:'))) {
            const suggestion = fix.suggestions.find(s => s.includes('Add:'));
            const [, field, value] = suggestion.match(/Add: "([^"]+)": (.+)/) || [];
            if (field && value) {
                console.log(`[AUTO-FIX] Adding ${field} with default value`);
            }
        }
    });

    // Write fixed file
    const fixedFilename = path.join(fixesDir, `${path.basename(filename, '.json')}_FIXED.json`);
    fs.writeFileSync(fixedFilename, JSON.stringify(fixedData, null, 4));
    
    // Write detailed fix report
    const reportFilename = path.join(fixesDir, `${path.basename(filename, '.json')}_FIX_REPORT.txt`);
    let report = `VALIDATION FIX REPORT for ${filename}\n`;
    report += `Generated: ${new Date().toISOString()}\n`;
    report += `Type: ${type}\n`;
    report += '='.repeat(50) + '\n\n';
    
    fixes.forEach((fix, index) => {
        report += `${index + 1}. ZONE/AREA: ${fix.zoneName}\n`;
        report += `   ERROR: ${fix.error}\n`;
        report += `   SUGGESTIONS:\n`;
        fix.suggestions.forEach(suggestion => {
            report += `   - ${suggestion}\n`;
        });
        report += '\n';
    });
    
    fs.writeFileSync(reportFilename, report);
    
    console.log(`[FIX FILES CREATED]`);
    console.log(`  - Fixed JSON: ${fixedFilename}`);
    console.log(`  - Detailed Report: ${reportFilename}`);
}

// Main execution
const [,, type, filename] = process.argv;

if (!type || !filename) {
    console.error('[ERROR] Usage: node validator.js [zones|tiers] [filename]');
    process.exit(1);
}

if (!fs.existsSync(filename)) {
    console.error(`[ERROR] File '${filename}' not found!`);
    process.exit(1);
}

try {
    const originalText = fs.readFileSync(filename, 'utf8');
    const data = JSON.parse(originalText);
    let result = { errors: [], fixes: [] };

    console.log(`[INFO] File size: ${fs.statSync(filename).size} bytes`);
    console.log(`[INFO] Validating ${type} schema...`);

    if (type === 'zones') {
        result = validateZones(data, originalText);
        if (result.errors.length === 0) {
            console.log(`[SUCCESS] Zones validation passed!`);
            console.log(`[INFO] Found ${data.zones.length} zones with ${data.zones.reduce((acc, zone) => acc + (zone.spawnPoints ? zone.spawnPoints.length : 0), 0)} total spawn points`);
        }
    } else if (type === 'tiers') {
        result = validateTiers(data, originalText);
        if (result.errors.length === 0) {
            console.log(`[SUCCESS] Tiers validation passed!`);
            console.log(`[INFO] Found ${Object.keys(data.tiers).length} tiers with ${Object.values(data.tiers).reduce((acc, tier) => acc + (tier.classnames ? tier.classnames.length : 0), 0)} total classnames`);
        }
    } else {
        console.error('[ERROR] Invalid type. Use "zones" or "tiers"');
        process.exit(1);
    }

    if (result.errors.length > 0) {
        console.error(`\n[ERROR] Found ${result.errors.length} validation error(s):\n`);
        result.fixes.forEach((fix, index) => {
            console.error(`${index + 1}. ZONE: ${fix.zoneName}`);
            console.error(`   ${fix.error}`);
            console.error(`   SUGGESTIONS: ${fix.suggestions.join(', ')}\n`);
        });
        
        // Create fix files
        createFixedFiles(filename, data, result.fixes, type);
        
        process.exit(1);
    }

} catch (error) {
    console.error(`[ERROR] Failed to parse JSON: ${error.message}`);
    if (error.message.includes('position')) {
        const match = error.message.match(/position (\d+)/);
        if (match) {
            console.error(`[ERROR] JSON syntax error near character position ${match[1]}`);
        }
    }
    process.exit(1);
}