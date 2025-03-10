import contractAddresses from '../../contracts.json';

export type ContractCategory = 'core' | 'resources' | 'lpPairs' | 'reactors' | 'agents';
export type ContractName = keyof typeof contractAddresses[ContractCategory];

/**
 * Get a contract address from the contracts.json file
 * @param category The category of the contract (core, resources, lpPairs, reactors)
 * @param name The name of the contract within the category
 * @returns The contract address
 * @throws Error if the contract address is not found
 */
export function getContractAddress(category: ContractCategory, name: string): string {
    try {
        const categoryAddresses = contractAddresses[category];
        if (!categoryAddresses) {
            throw new Error(`Contract category ${category} not found`);
        }

        const address = categoryAddresses[name as keyof typeof categoryAddresses];
        if (!address) {
            if (category === 'agents') {
                console.warn(`Agent address for ${name} not found. This may be expected during initialization.`);
                return "[Address will be available when agent is fully initialized]";
            }
            throw new Error(`Contract ${name} not found in category ${category}`);
        }

        return address;
    } catch (error) {
        if (category === 'agents') {
            console.warn(`Error getting agent address: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return "[Address will be available when agent is fully initialized]";
        }
        throw error;
    }
}

/**
 * Get all contract addresses for a specific category
 * @param category The category of contracts to retrieve
 * @returns An object containing all contract addresses for the specified category
 */
export function getCategoryAddresses(category: ContractCategory): Record<string, string> {
    const categoryAddresses = contractAddresses[category];
    if (!categoryAddresses) {
        throw new Error(`Contract category ${category} not found`);
    }
    return categoryAddresses;
}

/**
 * Get all contract addresses
 * @returns The complete contract addresses object
 */
export function getAllContractAddresses() {
    return contractAddresses;
}

/**
 * Check if an address belongs to a specific token or contract type
 * @param address The address to check
 * @param category The category to check against (e.g., 'resources', 'lpPairs')
 * @param tokenType Optional specific token type within the category
 * @returns Boolean indicating if the address belongs to the specified category/type
 */
export function isAddressOfType(address: string, category: ContractCategory, tokenType?: string): boolean {
  try {
    const categoryAddresses = contractAddresses[category];
    if (!categoryAddresses) {
      return false;
    }

    // Normalize the address for comparison
    const normalizedAddress = address.toLowerCase();
    
    // If a specific token type is provided, check only that one
    if (tokenType) {
      const tokenAddress = categoryAddresses[tokenType as keyof typeof categoryAddresses];
      return tokenAddress && normalizedAddress === (tokenAddress as string).toLowerCase();
    }
    
    // Otherwise check if the address matches any in the category
    return Object.values(categoryAddresses).some(
      (addr: any) => addr && addr.toLowerCase && addr.toLowerCase() === normalizedAddress
    );
  } catch (error) {
    console.error(`Error checking address type: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return false;
  }
}

/**
 * Get the token type for a given address
 * @param address The address to check
 * @param category The category to check against (e.g., 'resources', 'lpPairs')
 * @returns The token type or null if not found
 */
export function getTokenTypeForAddress(address: string, category: ContractCategory): string | null {
  try {
    const categoryAddresses = contractAddresses[category];
    if (!categoryAddresses) {
      return null;
    }

    // Normalize the address for comparison
    const normalizedAddress = address.toLowerCase();
    
    // Find the token type for this address
    for (const [tokenType, tokenAddress] of Object.entries(categoryAddresses)) {
      if ((tokenAddress as string).toLowerCase() === normalizedAddress) {
        return tokenType;
      }
    }
    
    return null;
  } catch (error) {
    console.error(`Error getting token type: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return null;
  }
} 