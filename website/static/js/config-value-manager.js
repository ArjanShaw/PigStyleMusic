// ============================================================================
// config-value-manager.js - Centralized configuration value fetcher with caching
// ============================================================================

// Cache object to store fetched configuration values
const configCache = {};

/**
 * Fetches a configuration value from the server by key
 * @param {string} configKey - The configuration key to fetch
 * @returns {Promise<string>} The configuration value
 * @throws {Error} If the endpoint fails or returns no value
 */
async function getConfigValue(configKey) {
    if (!configKey || typeof configKey !== 'string') {
        throw new Error(`Invalid config key: ${configKey}`);
    }

    // Return cached value if available
    if (configCache[configKey] !== undefined) {
        console.log(`Returning cached value for "${configKey}":`, configCache[configKey]);
        return configCache[configKey];
    }

    try {
        const baseUrl = window.AppConfig?.baseUrl || '';
        const response = await fetch(`${baseUrl}/config/${encodeURIComponent(configKey)}`, {
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        
        if (data.status !== 'success') {
            throw new Error(`API returned error status: ${data.status}`);
        }

        if (data.config_value === null || data.config_value === undefined) {
            throw new Error(`Configuration key "${configKey}" not found or returned null`);
        }

        // Cache the value before returning
        configCache[configKey] = data.config_value;
        console.log(`Cached value for "${configKey}":`, data.config_value);
        
        return data.config_value;
    } catch (error) {
        console.error(`Failed to fetch config value for "${configKey}":`, error);
        throw error;
    }
}