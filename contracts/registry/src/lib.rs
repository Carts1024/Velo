#![no_std]

mod errors;
mod events;
mod types;

pub use errors::RegistryError;
pub use types::Project;

use events::{
    ContractAdded, ContractRemoved, OwnershipTransferred, ProjectDeactivated, ProjectRegistered,
    ProjectUpdated,
};
use soroban_sdk::{contract, contractimpl, Address, BytesN, Env, String, Vec};
use types::DataKey;

const FIRST_PROJECT_ID: u64 = 1;
const MAX_NAME_BYTES: u32 = 64;
const MAX_CONTRACTS_PER_PROJECT: u32 = 25;
const TTL_THRESHOLD: u32 = 17_280;
const TTL_EXTEND_TO: u32 = 518_400;

#[contract]
pub struct TalaKitRegistry;

#[contractimpl]
impl TalaKitRegistry {
    pub fn register_project(
        env: Env,
        owner: Address,
        name: String,
        metadata_hash: BytesN<32>,
    ) -> Result<u64, RegistryError> {
        owner.require_auth();
        validate_name(&name)?;

        let project_id = next_project_id(&env);
        let project = Project {
            id: project_id,
            owner: owner.clone(),
            name,
            metadata_hash,
            active: true,
            created_ledger: env.ledger().sequence(),
        };

        set_project(&env, &project);
        set_project_contracts(&env, project_id, &Vec::new(&env));
        env.storage()
            .instance()
            .set(&DataKey::NextProjectId, &(project_id + 1));
        extend_instance_ttl(&env);

        ProjectRegistered { project_id, owner }.publish(&env);

        Ok(project_id)
    }

    pub fn update_project(
        env: Env,
        project_id: u64,
        metadata_hash: BytesN<32>,
    ) -> Result<(), RegistryError> {
        let mut project = require_active_owner_project(&env, project_id)?;
        project.metadata_hash = metadata_hash;
        set_project(&env, &project);

        ProjectUpdated {
            project_id,
            owner: project.owner,
        }
        .publish(&env);

        Ok(())
    }

    pub fn add_contract(
        env: Env,
        project_id: u64,
        contract_id: Address,
    ) -> Result<(), RegistryError> {
        let project = require_active_owner_project(&env, project_id)?;
        let mut contracts = get_contracts(&env, project_id);

        if contracts.contains(&contract_id) {
            return Err(RegistryError::ContractAlreadyAdded);
        }

        if contracts.len() >= MAX_CONTRACTS_PER_PROJECT {
            return Err(RegistryError::ContractLimitReached);
        }

        contracts.push_back(contract_id.clone());
        set_project_contracts(&env, project_id, &contracts);

        ContractAdded {
            project_id,
            contract_id,
        }
        .publish(&env);
        touch_project(&env, &project);

        Ok(())
    }

    pub fn remove_contract(
        env: Env,
        project_id: u64,
        contract_id: Address,
    ) -> Result<(), RegistryError> {
        let project = require_owner_project(&env, project_id)?;
        let contracts = get_contracts(&env, project_id);
        let mut updated = Vec::new(&env);
        let mut removed = false;

        for existing in contracts.iter() {
            if existing == contract_id {
                removed = true;
            } else {
                updated.push_back(existing);
            }
        }

        if !removed {
            return Err(RegistryError::ContractNotFound);
        }

        set_project_contracts(&env, project_id, &updated);

        ContractRemoved {
            project_id,
            contract_id,
        }
        .publish(&env);
        touch_project(&env, &project);

        Ok(())
    }

    pub fn transfer_ownership(
        env: Env,
        project_id: u64,
        new_owner: Address,
    ) -> Result<(), RegistryError> {
        let mut project = require_owner_project(&env, project_id)?;
        let old_owner = project.owner.clone();
        project.owner = new_owner.clone();
        set_project(&env, &project);

        OwnershipTransferred {
            project_id,
            old_owner,
            new_owner,
        }
        .publish(&env);

        Ok(())
    }

    pub fn deactivate_project(env: Env, project_id: u64) -> Result<(), RegistryError> {
        let mut project = require_owner_project(&env, project_id)?;
        project.active = false;
        set_project(&env, &project);

        ProjectDeactivated {
            project_id,
            owner: project.owner,
        }
        .publish(&env);

        Ok(())
    }

    pub fn get_project(env: Env, project_id: u64) -> Option<Project> {
        let project = env
            .storage()
            .persistent()
            .get::<DataKey, Project>(&DataKey::Project(project_id));

        if project.is_some() {
            extend_project_ttl(&env, project_id);
        }

        project
    }

    pub fn get_project_contracts(env: Env, project_id: u64) -> Vec<Address> {
        get_contracts(&env, project_id)
    }
}

fn validate_name(name: &String) -> Result<(), RegistryError> {
    if name.len() == 0 || name.len() > MAX_NAME_BYTES {
        return Err(RegistryError::InvalidName);
    }

    Ok(())
}

fn next_project_id(env: &Env) -> u64 {
    env.storage()
        .instance()
        .get(&DataKey::NextProjectId)
        .unwrap_or(FIRST_PROJECT_ID)
}

fn require_owner_project(env: &Env, project_id: u64) -> Result<Project, RegistryError> {
    let project = get_required_project(env, project_id)?;
    project.owner.require_auth();
    Ok(project)
}

fn require_active_owner_project(env: &Env, project_id: u64) -> Result<Project, RegistryError> {
    let project = require_owner_project(env, project_id)?;

    if !project.active {
        return Err(RegistryError::InactiveProject);
    }

    Ok(project)
}

fn get_required_project(env: &Env, project_id: u64) -> Result<Project, RegistryError> {
    let project = env
        .storage()
        .persistent()
        .get::<DataKey, Project>(&DataKey::Project(project_id))
        .ok_or(RegistryError::ProjectNotFound)?;

    extend_project_ttl(env, project_id);
    Ok(project)
}

fn get_contracts(env: &Env, project_id: u64) -> Vec<Address> {
    let contracts = env
        .storage()
        .persistent()
        .get::<DataKey, Vec<Address>>(&DataKey::ProjectContracts(project_id))
        .unwrap_or_else(|| Vec::new(env));

    extend_contracts_ttl(env, project_id);
    contracts
}

fn set_project(env: &Env, project: &Project) {
    env.storage()
        .persistent()
        .set(&DataKey::Project(project.id), project);
    extend_project_ttl(env, project.id);
    extend_instance_ttl(env);
}

fn touch_project(env: &Env, project: &Project) {
    extend_project_ttl(env, project.id);
    extend_instance_ttl(env);
}

fn set_project_contracts(env: &Env, project_id: u64, contracts: &Vec<Address>) {
    env.storage()
        .persistent()
        .set(&DataKey::ProjectContracts(project_id), contracts);
    extend_contracts_ttl(env, project_id);
    extend_instance_ttl(env);
}

fn extend_instance_ttl(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
}

fn extend_project_ttl(env: &Env, project_id: u64) {
    env.storage().persistent().extend_ttl(
        &DataKey::Project(project_id),
        TTL_THRESHOLD,
        TTL_EXTEND_TO,
    );
}

fn extend_contracts_ttl(env: &Env, project_id: u64) {
    env.storage().persistent().extend_ttl(
        &DataKey::ProjectContracts(project_id),
        TTL_THRESHOLD,
        TTL_EXTEND_TO,
    );
}
