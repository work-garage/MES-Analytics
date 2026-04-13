export const WORKFLOW_SEQUENCE = {
    afterGateSubmit: '/weighbridge',
    afterWeighbridgeSubmit: '/vehicle-inspection',
    afterVehicleInspectionAccept: '/qa',
    afterQaAccept: '/stores/grn-create',
    afterGrnFinalize: '/production/sub-batch',
    afterSubBatchStart: '/production/mixing',
    afterMixingSubmit: '/production/cutting',
    afterCuttingSubmit: '/production/oven',
    afterOvenSubmit: '/production/packing',
    afterPackingSubmit: '/production/fg-batch',
    afterFgBatchSubmit: '/dispatch/create',
    afterDispatchSubmit: '/dispatch',
} as const
