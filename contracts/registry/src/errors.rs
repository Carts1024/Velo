use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum RegistryError {
    ProjectNotFound = 1,
    InactiveProject = 2,
    ContractAlreadyAdded = 3,
    ContractNotFound = 4,
    ContractLimitReached = 5,
    InvalidName = 6,
}
