#!/usr/bin/env node

/**
 * Verification script to ensure block connection logic is properly centralized
 * Run with: node scripts/verify-connections.js
 */

const fs = require('fs');
const path = require('path');

// Files that should NOT contain connection logic (they should use the centralized manager)
const filesToCheck = [
  'components/editor.tsx',
  'components/block-editor/block-editor.tsx',
  'components/quiz-view.tsx',
  'components/testview.tsx',
  'hooks/use-block-manager.ts',
  'lib/brain/brain.ts'
];

// Patterns that indicate duplicate connection logic
const duplicatePatterns = [
  /function getAllLinkedWhatBlocks/,
  /let isConnected = false/,
  /let whoConnectedToPrev = false/,
  /let whoConnectedToNext = false/,
  /if \(block\.type === "who" && Array\.isArray\(block\.linkedBlockIds\)/,
  /if \(block\.type === "what" && index > 0\)/,
  /if \(block\.type === "who" && index > 0\)/,
  /if \(block\.type === "who" && index < blocks\.length - 1\)/,
  /const blockClass = block\.type === "who"/,
  /while \(currentIds\.length > 0\)/,
  /let currentIds = whoBlock\.linkedBlockIds/,
  /const blockIndex = allBlocks\.findIndex\(b => b\.id === whoBlock\.id\)/
];

// Patterns that indicate proper use of centralized logic
const centralizedPatterns = [
  /BlockConnectionManager\./,
  /import.*BlockConnectionManager/,
  /useBlockConnections/,
  /import.*use-block-connections/
];

function checkFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const issues = [];
    const goodPractices = [];

    // Check for duplicate patterns
    duplicatePatterns.forEach((pattern, index) => {
      const matches = content.match(pattern);
      if (matches) {
        issues.push(`Line ${content.substring(0, content.indexOf(matches[0])).split('\n').length}: Found duplicate connection logic pattern`);
      }
    });

    // Check for centralized patterns
    centralizedPatterns.forEach((pattern) => {
      const matches = content.match(pattern);
      if (matches) {
        goodPractices.push(`Found centralized connection usage`);
      }
    });

    return { issues, goodPractices };
  } catch (error) {
    return { issues: [`Error reading file: ${error.message}`], goodPractices: [] };
  }
}

function main() {
  console.log('🔍 Verifying block connection centralization...\n');

  let totalIssues = 0;
  let totalGoodPractices = 0;

  filesToCheck.forEach(filePath => {
    console.log(`📁 Checking ${filePath}...`);
    const result = checkFile(filePath);

    if (result.issues.length > 0) {
      console.log(`  ❌ Found ${result.issues.length} issues:`);
      result.issues.forEach(issue => {
        console.log(`    - ${issue}`);
      });
      totalIssues += result.issues.length;
    } else {
      console.log(`  ✅ No duplicate logic found`);
    }

    if (result.goodPractices.length > 0) {
      console.log(`  ✅ Found centralized usage`);
      totalGoodPractices += result.goodPractices.length;
    }

    console.log('');
  });

  // Check if centralized manager exists
  const managerPath = 'lib/block-connections.ts';
  if (fs.existsSync(managerPath)) {
    console.log(`✅ Centralized manager exists: ${managerPath}`);
  } else {
    console.log(`❌ Centralized manager missing: ${managerPath}`);
    totalIssues++;
  }

  // Check if hook exists
  const hookPath = 'hooks/use-block-connections.ts';
  if (fs.existsSync(hookPath)) {
    console.log(`✅ Connection hook exists: ${hookPath}`);
  } else {
    console.log(`❌ Connection hook missing: ${hookPath}`);
    totalIssues++;
  }

  console.log('\n📊 Summary:');
  console.log(`  - Total issues found: ${totalIssues}`);
  console.log(`  - Good practices found: ${totalGoodPractices}`);

  if (totalIssues === 0) {
    console.log('\n🎉 All connection logic is properly centralized!');
  } else {
    console.log('\n⚠️  Some issues found. Please review the centralized connection logic.');
  }
}

if (require.main === module) {
  main();
}

module.exports = { checkFile, main }; 