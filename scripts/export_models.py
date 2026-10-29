import sys
import torch
import timm
from facenet_pytorch.models.mtcnn import PNet, RNet, ONet

ckpt, out = sys.argv[1], sys.argv[2]
sd = torch.load(ckpt, map_location="cpu")
net = timm.create_model("legacy_xception", pretrained=False, num_classes=1)
net.load_state_dict(sd)
net.eval()
torch.onnx.export(
    net, torch.randn(2, 3, 299, 299), f"{out}/xception.onnx",
    input_names=["x"], output_names=["logit"],
    dynamic_axes={"x": {0: "n"}, "logit": {0: "n"}}, opset_version=17, dynamo=False,
)
p, r, o = PNet().eval(), RNet().eval(), ONet().eval()
torch.onnx.export(
    p, torch.randn(1, 3, 60, 80), f"{out}/pnet.onnx", input_names=["x"], output_names=["reg", "prob"],
    dynamic_axes={"x": {2: "h", 3: "w"}, "reg": {2: "h", 3: "w"}, "prob": {2: "h", 3: "w"}}, opset_version=17, dynamo=False,
)
torch.onnx.export(
    r, torch.randn(4, 3, 24, 24), f"{out}/rnet.onnx", input_names=["x"], output_names=["reg", "prob"],
    dynamic_axes={"x": {0: "n"}, "reg": {0: "n"}, "prob": {0: "n"}}, opset_version=17, dynamo=False,
)
torch.onnx.export(
    o, torch.randn(4, 3, 48, 48), f"{out}/onet.onnx", input_names=["x"], output_names=["reg", "pts", "prob"],
    dynamic_axes={"x": {0: "n"}, "reg": {0: "n"}, "pts": {0: "n"}, "prob": {0: "n"}}, opset_version=17, dynamo=False,
)
