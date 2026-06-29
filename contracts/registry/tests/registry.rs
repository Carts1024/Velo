use soroban_sdk::{
    testutils::{Address as _, Events as _, MockAuth, MockAuthInvoke},
    Address, BytesN, Env, Event, IntoVal, String,
};
use velo_registry::{
    ContractAdded, ContractRemoved, OwnershipTransferred, Project, ProjectDeactivated,
    ProjectRegistered, ProjectUpdated, RegistryError, VeloRegistry, VeloRegistryClient,
};

fn setup() -> (
    Env,
    VeloRegistryClient<'static>,
    Address,
    Address,
    BytesN<32>,
) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(VeloRegistry, ());
    let client = VeloRegistryClient::new(&env, &contract_id);
    let owner = Address::generate(&env);
    let metadata_hash = BytesN::from_array(&env, &[7; 32]);

    (env, client, contract_id, owner, metadata_hash)
}

fn register_demo_project(
    env: &Env,
    client: &VeloRegistryClient,
    owner: &Address,
    metadata_hash: &BytesN<32>,
) -> u64 {
    client.register_project(owner, &String::from_str(env, "DemoPay"), metadata_hash)
}

#[test]
fn register_project_stores_authoritative_registry_state() {
    let (env, client, _contract_id, owner, metadata_hash) = setup();

    let project_id = register_demo_project(&env, &client, &owner, &metadata_hash);
    let project = client.get_project(&project_id).unwrap();

    assert_eq!(project_id, 1);
    assert_eq!(
        project,
        Project {
            id: project_id,
            owner,
            name: String::from_str(&env, "DemoPay"),
            metadata_hash,
            active: true,
            created_ledger: env.ledger().sequence(),
        }
    );
    assert_eq!(client.get_project_contracts(&project_id).len(), 0);
}

#[test]
fn add_and_remove_official_contract_ids() {
    let (env, client, _contract_id, owner, metadata_hash) = setup();
    let project_id = register_demo_project(&env, &client, &owner, &metadata_hash);
    let official_contract = Address::generate(&env);

    client.add_contract(&project_id, &official_contract);
    assert_eq!(
        client.get_project_contracts(&project_id),
        soroban_sdk::vec![&env, official_contract.clone()]
    );

    client.remove_contract(&project_id, &official_contract);
    assert_eq!(client.get_project_contracts(&project_id).len(), 0);
}

#[test]
fn duplicate_contract_ids_are_rejected() {
    let (env, client, _contract_id, owner, metadata_hash) = setup();
    let project_id = register_demo_project(&env, &client, &owner, &metadata_hash);
    let official_contract = Address::generate(&env);

    client.add_contract(&project_id, &official_contract);
    let err = client
        .try_add_contract(&project_id, &official_contract)
        .unwrap_err()
        .unwrap();

    assert_eq!(err, RegistryError::ContractAlreadyAdded);
}

#[test]
fn inactive_projects_cannot_add_contracts() {
    let (env, client, _contract_id, owner, metadata_hash) = setup();
    let project_id = register_demo_project(&env, &client, &owner, &metadata_hash);
    let official_contract = Address::generate(&env);

    client.deactivate_project(&project_id);
    let err = client
        .try_add_contract(&project_id, &official_contract)
        .unwrap_err()
        .unwrap();

    assert_eq!(err, RegistryError::InactiveProject);
}

#[test]
fn ownership_transfer_changes_required_owner() {
    let (env, client, _contract_id, owner, metadata_hash) = setup();
    let project_id = register_demo_project(&env, &client, &owner, &metadata_hash);
    let new_owner = Address::generate(&env);

    client.transfer_ownership(&project_id, &new_owner);

    let project = client.get_project(&project_id).unwrap();
    assert_eq!(project.owner, new_owner);
}

#[test]
fn invalid_project_names_are_rejected() {
    let (env, client, _contract_id, owner, metadata_hash) = setup();

    let err = client
        .try_register_project(&owner, &String::from_str(&env, ""), &metadata_hash)
        .unwrap_err()
        .unwrap();

    assert_eq!(err, RegistryError::InvalidName);
}

#[test]
fn missing_project_reads_and_mutations_are_bounded() {
    let (env, client, _contract_id, _owner, metadata_hash) = setup();
    let missing_project_id = 404;
    let official_contract = Address::generate(&env);

    assert_eq!(client.get_project(&missing_project_id), None);
    assert_eq!(client.get_project_contracts(&missing_project_id).len(), 0);

    let update_err = client
        .try_update_project(&missing_project_id, &metadata_hash)
        .unwrap_err()
        .unwrap();
    let add_err = client
        .try_add_contract(&missing_project_id, &official_contract)
        .unwrap_err()
        .unwrap();
    let remove_err = client
        .try_remove_contract(&missing_project_id, &official_contract)
        .unwrap_err()
        .unwrap();

    assert_eq!(update_err, RegistryError::ProjectNotFound);
    assert_eq!(add_err, RegistryError::ProjectNotFound);
    assert_eq!(remove_err, RegistryError::ProjectNotFound);
}

#[test]
fn contract_limit_is_enforced() {
    let (env, client, _contract_id, owner, metadata_hash) = setup();
    let project_id = register_demo_project(&env, &client, &owner, &metadata_hash);

    for _ in 0..25 {
        let official_contract = Address::generate(&env);
        client.add_contract(&project_id, &official_contract);
    }

    let overflow_contract = Address::generate(&env);
    let err = client
        .try_add_contract(&project_id, &overflow_contract)
        .unwrap_err()
        .unwrap();

    assert_eq!(client.get_project_contracts(&project_id).len(), 25);
    assert_eq!(err, RegistryError::ContractLimitReached);
}

#[test]
fn removing_unknown_contract_is_rejected() {
    let (env, client, _contract_id, owner, metadata_hash) = setup();
    let project_id = register_demo_project(&env, &client, &owner, &metadata_hash);
    let official_contract = Address::generate(&env);

    let err = client
        .try_remove_contract(&project_id, &official_contract)
        .unwrap_err()
        .unwrap();

    assert_eq!(err, RegistryError::ContractNotFound);
}

#[test]
fn registry_mutations_emit_observable_events() {
    let (env, client, contract_id, owner, metadata_hash) = setup();
    let project_id = register_demo_project(&env, &client, &owner, &metadata_hash);
    assert_eq!(
        env.events().all(),
        std::vec![ProjectRegistered {
            project_id,
            owner: owner.clone(),
        }
        .to_xdr(&env, &contract_id)]
    );

    let updated_hash = BytesN::from_array(&env, &[9; 32]);
    client.update_project(&project_id, &updated_hash);
    assert_eq!(
        env.events().all(),
        std::vec![ProjectUpdated {
            project_id,
            owner: owner.clone(),
        }
        .to_xdr(&env, &contract_id)]
    );

    let official_contract = Address::generate(&env);
    client.add_contract(&project_id, &official_contract);
    assert_eq!(
        env.events().all(),
        std::vec![ContractAdded {
            project_id,
            contract_id: official_contract.clone(),
        }
        .to_xdr(&env, &contract_id)]
    );

    client.remove_contract(&project_id, &official_contract);
    assert_eq!(
        env.events().all(),
        std::vec![ContractRemoved {
            project_id,
            contract_id: official_contract,
        }
        .to_xdr(&env, &contract_id)]
    );

    let new_owner = Address::generate(&env);
    client.transfer_ownership(&project_id, &new_owner);
    assert_eq!(
        env.events().all(),
        std::vec![OwnershipTransferred {
            project_id,
            old_owner: owner,
            new_owner: new_owner.clone(),
        }
        .to_xdr(&env, &contract_id)]
    );

    client.deactivate_project(&project_id);
    assert_eq!(
        env.events().all(),
        std::vec![ProjectDeactivated {
            project_id,
            owner: new_owner,
        }
        .to_xdr(&env, &contract_id)]
    );
}

#[test]
fn non_owner_auth_cannot_mutate_project_contracts() {
    let env = Env::default();
    let contract_id = env.register(VeloRegistry, ());
    let client = VeloRegistryClient::new(&env, &contract_id);
    let owner = Address::generate(&env);
    let non_owner = Address::generate(&env);
    let metadata_hash = BytesN::from_array(&env, &[7; 32]);
    let name = String::from_str(&env, "DemoPay");

    let project_id = client
        .mock_auths(&[MockAuth {
            address: &owner,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "register_project",
                args: (&owner, &name, &metadata_hash).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .register_project(&owner, &name, &metadata_hash);

    let official_contract = Address::generate(&env);
    let result = client
        .mock_auths(&[MockAuth {
            address: &non_owner,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "add_contract",
                args: (&project_id, &official_contract).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .try_add_contract(&project_id, &official_contract);

    assert!(result.is_err());
    assert_eq!(client.get_project_contracts(&project_id).len(), 0);
}
