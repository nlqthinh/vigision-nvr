
import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np

from vigision.graph_utils import Graph


class GraphConvolution(nn.Module):
    def __init__(self, in_channels, out_channels, kernel_size,
                 t_kernel_size=1,
                 t_stride=1,
                 t_padding=0,
                 t_dilation=1,
                 bias=True):
        super().__init__()

        self.kernel_size = kernel_size
        self.conv = nn.Conv2d(in_channels,
                              out_channels * kernel_size,
                              kernel_size=(t_kernel_size, 1),
                              padding=(t_padding, 0),
                              stride=(t_stride, 1),
                              dilation=(t_dilation, 1),
                              bias=bias)

    def forward(self, x, A):
        
        x = self.conv(x)
        n, kc, t, v = x.size()
        x = x.view(n, self.kernel_size, kc//self.kernel_size, t, v)
        x = torch.einsum('nkctv,kvw->nctw', (x, A))

        return x.contiguous()


class STGCN_Layer(nn.Module):
    def __init__(self, in_channels, out_channels, kernel_size,
                 stride=1,
                 dropout=0.2):
        super().__init__()
        assert len(kernel_size) == 2
        assert kernel_size[0] % 2 == 1

        padding = ((kernel_size[0] - 1) // 2, 0)
        self.gcn = GraphConvolution(in_channels, out_channels, kernel_size[1])
        self.tcn = nn.Sequential(nn.BatchNorm2d(out_channels),
                                 nn.ReLU(inplace=True),
                                 nn.Conv2d(out_channels,
                                           out_channels,
                                           (kernel_size[0], 1),
                                           (stride, 1),
                                           padding),
                                 nn.BatchNorm2d(out_channels),
                                 nn.Dropout(dropout, inplace=True)
                                 )


        self.relu = nn.ReLU(inplace=True)
        
    def forward(self, x, A):
        x = self.gcn(x, A)
        x = self.tcn(x) 
        return self.relu(x)


class OneShot_STGCN_Block(nn.ModuleDict):
    def __init__(self, in_channels, n_layers, kernel_size, **kwargs):
        super(OneShot_STGCN_Block, self).__init__()

        layers = dict()
        for i in range(n_layers):
            layer = STGCN_Layer(in_channels, in_channels , kernel_size, 1, **kwargs)
            layers['conv{}'.format(i)] = layer

        self.block = nn.ModuleDict(layers)

    def forward(self, x, A, edge_importance):
        # if(isinstance(x, torch.Tensor)):
        #     x = [x]
        
        outputs = [x]
        idx = 0
        for layer_name, layer in self.block.items():
            x = layer(x, A * edge_importance[idx])
            outputs.append(x)
            idx += 1
        
        return torch.cat(outputs, dim=1)

class StreamSpatialTemporalGraph(nn.Module):
    def __init__(self, in_channels, graph_args, num_class=None,
                 edge_importance_weighting=True ,**kwargs):
        super().__init__()
        # Load graph.
        graph = Graph(**graph_args)
        A = torch.tensor(graph.A, dtype=torch.float32, requires_grad=False)
        self.register_buffer('A', A)

        # Networks.
        spatial_kernel_size = A.size(0)
        temporal_kernel_size = 9
        kernel_size = (temporal_kernel_size, spatial_kernel_size)

        self.data_bn = nn.BatchNorm1d(in_channels * A.size(1))

        self.residual_0 = nn.Sequential()

        kwargs0 = {k: v for k, v in kwargs.items() if k != 'dropout'}
        self.gcn_0 = STGCN_Layer(in_channels, 32, kernel_size, 1, **kwargs0)  
        self.osa_block_0 = OneShot_STGCN_Block(
                                            in_channels=32,
                                            n_layers=2,
                                            kernel_size = kernel_size, 
                                            **kwargs)
        
        self.osa_block_1 = OneShot_STGCN_Block(
                                                in_channels=96,
                                                n_layers=2,
                                                kernel_size = kernel_size, 
                                                **kwargs)
        # self.osa_block_2 = OneShot_STGCN_Block(
        #                                 in_channels=288,
        #                                 n_layers=4,
        #                                 kernel_size = kernel_size, 
        #                                 **kwargs)

        # self.osa_block_3 = OneShot_STGCN_Block(
        #                                 in_channels=256,
        #                                 n_layers=2,
        #                                 kernel_size = kernel_size, 
        #                                 **kwargs)
        # initialize parameters for edge importance weighting.
        if edge_importance_weighting:
            self.edge_importance = nn.ParameterList([
                nn.Parameter(torch.ones(A.size()))
                for i in range(2 + 4 + 1)
            ])
        else:
            self.edge_importance = [1] * len(self.st_gcn_networks)

        if num_class is not None:
            self.cls = nn.Conv2d(256, num_class, kernel_size=1)
        else:
            self.cls = lambda x: x

    def forward(self, x):
        # data normalization.
        N, C, T, V = x.size()
        x = x.permute(0, 3, 1, 2).contiguous()  # (N, V, C, T)
        x = x.view(N, V * C, T)
        x = self.data_bn(x)
        x = x.view(N, V, C, T)
        x = x.permute(0, 2, 3, 1).contiguous()
        x = x.view(N, C, T, V)

        x = self.gcn_0(x, self.A * self.edge_importance[0])
        x = self.osa_block_0(x, self.A, self.edge_importance[1:3])
        x = self.osa_block_1(x, self.A, self.edge_importance[3:7])
        # x = self.osa_block_2(x, self.A, self.edge_importance[5:9])
        # x = self.osa_block_3(x, self.A, self.edge_importance[7:9])

        x = F.avg_pool2d(x, x.size()[2:])
        x = self.cls(x)
        x = x.view(x.size(0), -1)

        return x


class OSA_STGCN_nano_1S(nn.Module):
    def __init__(self, num_class, graph_args, edge_importance_weighting=True, **kwargs):
        super().__init__()
      
        self.st_gcn = StreamSpatialTemporalGraph(in_channels= 3, 
                                                graph_args = graph_args, 
                                                num_class= None,
                                                edge_importance_weighting = edge_importance_weighting,
                                                **kwargs)
        self.fcn = nn.Linear(288, num_class)

    def forward(self, inputs):

        out = self.st_gcn(inputs)
        out = self.fcn(out)
        return torch.sigmoid(out)

class OSA_STGCN_nano_2S(nn.Module):
    def __init__(self, num_class, graph_args, edge_importance_weighting=True,
                 **kwargs):
        super().__init__()
        
        self.pts_stream = StreamSpatialTemporalGraph(in_channels= 3, 
                                                     graph_args = graph_args, 
                                                     num_class= None,
                                                     edge_importance_weighting = edge_importance_weighting,
                                                     **kwargs)
        self.mot_stream = StreamSpatialTemporalGraph(in_channels= 2, 
                                                     graph_args = graph_args, 
                                                     num_class= None,
                                                     edge_importance_weighting = edge_importance_weighting,
                                                     **kwargs)

        self.fcn = nn.Linear(384, num_class)

    def forward(self, joints):
        motions = joints[:, :2, 1:, :] - joints[:, :2, :-1, :]

        out1 = self.pts_stream(joints)
        out2 = self.mot_stream(motions)

        concat = torch.cat([out1, out2], dim=-1)
        out = self.fcn(concat)

        return torch.sigmoid(out)